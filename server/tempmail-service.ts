import https from "node:https"
import { randomUUID } from "node:crypto"

import { tempInboxes, tempEmailsDb, operationLogs, type TempInboxRow, type TempEmailRow } from "./db"

const PROVIDER_SERVICE = "mail.7q5g2.us.ci"
const PROVIDER_API_BASE = process.env.TEMPMAIL_PROVIDER_API_URL || "https://cloudflare_temp_email.zibakiqal228.workers.dev"
const PROVIDER_ADMIN_AUTH = process.env.TEMPMAIL_PROVIDER_ADMIN_AUTH || ""
const PROVIDER_DOMAIN = process.env.TEMPMAIL_PROVIDER_DOMAIN || "7q5g2.us.ci"
const PROVIDER_RETENTION_DAYS = Number(process.env.TEMPMAIL_PROVIDER_RETENTION_DAYS || 30)

export { PROVIDER_SERVICE }

type ProviderAddressRow = {
  id: number
  name: string
  password?: string | null
  source_meta?: string | null
  created_at?: string
  updated_at?: string
  mail_count?: number
  send_count?: number
}

type ProviderMailRow = {
  id?: number | string
  address?: string
  source?: string
  subject?: string
  text?: string
  message?: string
  created_at?: string
}

function ensureProviderConfigured() {
  if (!PROVIDER_ADMIN_AUTH.trim()) {
    throw new Error("TEMPMAIL_PROVIDER_ADMIN_AUTH is not configured")
  }
}

function callProvider<T>(pathname: string, init?: { method?: string; body?: Record<string, unknown> }): Promise<T> {
  ensureProviderConfigured()
  const url = new URL(pathname, PROVIDER_API_BASE)
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init?.method || "GET",
        headers: {
          "x-admin-auth": PROVIDER_ADMIN_AUTH,
          "Content-Type": "application/json",
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let raw = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => { raw += chunk })
        res.on("end", () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`provider request failed: HTTP ${res.statusCode} ${raw}`.trim()))
            return
          }
          try {
            resolve(raw ? JSON.parse(raw) as T : ({} as T))
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    req.setTimeout(30000, () => req.destroy(new Error("provider request timed out")))
    req.on("error", reject)
    if (init?.body) req.write(JSON.stringify(init.body))
    req.end()
  })
}

function createMailboxName() {
  return `cm${Date.now().toString(36)}${randomUUID().replace(/-/g, "").slice(0, 6)}`
}

function toIsoDate(value?: string) {
  if (!value) return new Date().toISOString()
  const parsed = new Date(`${value} UTC`)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function normalizeMailContent(mail: ProviderMailRow) {
  const html = typeof mail.message === "string" ? mail.message : ""
  const text = typeof mail.text === "string" && mail.text.trim()
    ? mail.text
    : html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  return { html, text }
}

export interface TempmailCreateResult {
  id: string
  address: string
  expires_at: string
  status: string
  service: string
  note: string
  created_at: string
}

export interface TempmailRefreshResult {
  inbox: TempInboxRow | null
  emails: TempEmailRow[]
  expired: boolean
}

export async function createTempInbox(note?: string): Promise<TempmailCreateResult> {
  const data = await callProvider<{ jwt: string; address: string; password?: string | null; address_id: number }>("/admin/new_address", {
    method: "POST",
    body: {
      enablePrefix: true,
      enableRandomSubdomain: false,
      name: createMailboxName(),
      domain: PROVIDER_DOMAIN,
    },
  })
  const expiresAt = new Date(Date.now() + PROVIDER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const inbox = tempInboxes.create({
    address: data.address,
    token: String(data.address_id),
    expires_at: expiresAt,
    note: note ?? "",
    service: PROVIDER_SERVICE,
  })
  operationLogs.create({
    actor_username: "system",
    actor_role: "system",
    action: "tempmail.create",
    target_type: "temp_inbox",
    target_id: inbox.id,
    details_json: JSON.stringify({ address: inbox.address, expires_at: expiresAt, provider: PROVIDER_SERVICE }),
  })
  return {
    id: inbox.id,
    address: inbox.address,
    expires_at: inbox.expires_at,
    status: inbox.status,
    service: inbox.service,
    note: inbox.note,
    created_at: inbox.created_at,
  }
}

export async function refreshTempInbox(inboxId: string): Promise<TempmailRefreshResult> {
  const inbox = tempInboxes.get(inboxId)
  if (!inbox) {
    throw new Error(`Inbox ${inboxId} not found`)
  }
  const data = await callProvider<{ results: ProviderMailRow[]; count: number }>(`/admin/mails?limit=100&offset=0&address=${encodeURIComponent(inbox.address)}`)
  const emailList = Array.isArray(data.results) ? data.results : []
  for (const email of emailList) {
    const messageKey = email.id != null
      ? String(email.id)
      : `${email.created_at || Date.now()}-${email.subject || "mail"}`
    const { html, text } = normalizeMailContent(email)
    tempEmailsDb.upsert({
      inbox_id: inboxId,
      message_key: messageKey,
      sender: email.source || "",
      subject: email.subject || "",
      text_body: text,
      html_body: html,
      is_read: 0,
      received_at: toIsoDate(email.created_at),
    })
  }
  tempInboxes.updateStatus(inboxId, "active")
  return {
    inbox: tempInboxes.get(inboxId),
    emails: tempEmailsDb.listByInbox(inboxId),
    expired: false,
  }
}

export async function refreshAllActiveTempInboxes(): Promise<void> {
  const all = tempInboxes.list()
  const now = new Date().toISOString()
  for (const inbox of all) {
    if (inbox.status === "expired") continue
    if (inbox.expires_at <= now) continue
    try {
      await refreshTempInbox(inbox.id)
    } catch {
      void 0
    }
  }
}

export async function deleteTempInbox(inboxId: string): Promise<void> {
  const inbox = tempInboxes.get(inboxId)
  if (!inbox) return
  const addressId = Number(inbox.token)
  if (!Number.isNaN(addressId) && addressId > 0) {
    await callProvider<{ success?: boolean }>(`/admin/delete_address/${addressId}`, { method: "DELETE" })
  }
  tempEmailsDb.deleteByInbox(inboxId)
  tempInboxes.delete(inboxId)
  operationLogs.create({
    actor_username: "system",
    actor_role: "system",
    action: "tempmail.delete",
    target_type: "temp_inbox",
    target_id: inboxId,
    details_json: JSON.stringify({ address: inbox.address }),
  })
}

export async function cleanupExpiredTempInboxes(): Promise<number> {
  const all = tempInboxes.list()
  const now = new Date().toISOString()
  let deleted = 0
  for (const inbox of all) {
    if (inbox.expires_at < now || inbox.status === "expired") {
      tempEmailsDb.deleteByInbox(inbox.id)
      tempInboxes.delete(inbox.id)
      deleted++
    }
  }
  if (deleted > 0) {
    operationLogs.create({
      actor_username: "system",
      actor_role: "system",
      action: "tempmail.cleanup",
      target_type: "temp_inbox",
      target_id: "",
      details_json: JSON.stringify({ deleted }),
    })
  }
  return deleted
}
