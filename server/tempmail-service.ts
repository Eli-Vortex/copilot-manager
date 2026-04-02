import { tempInboxes, tempEmailsDb, operationLogs, type TempInboxRow, type TempEmailRow } from "./db"

const BASE_URL = "https://api.tempmail.lol/v2"

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
  const res = await fetch(`${BASE_URL}/inbox/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    throw new Error(`tempmail.lol create failed: HTTP ${res.status}`)
  }
  const data = await res.json() as { address: string; token: string }
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const inbox = tempInboxes.create({
    address: data.address,
    token: data.token,
    expires_at: expiresAt,
    note: note ?? "",
    service: "tempmail.lol",
  })
  operationLogs.create({
    actor_username: "system",
    actor_role: "system",
    action: "tempmail.create",
    target_type: "temp_inbox",
    target_id: inbox.id,
    details_json: JSON.stringify({ address: inbox.address, expires_at: expiresAt }),
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
  const res = await fetch(`${BASE_URL}/inbox?token=${encodeURIComponent(inbox.token)}`)
  if (!res.ok) {
    throw new Error(`tempmail.lol refresh failed: HTTP ${res.status}`)
  }
  type EmailEntry = { from: string; to?: string; subject: string; body?: string; html?: string | null; date?: number | string }
  const data = await res.json() as EmailEntry[] | { emails?: EmailEntry[]; email?: EmailEntry[] } | null
  if (data === null || data === undefined || (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0)) {
    tempInboxes.updateStatus(inboxId, "expired")
    return {
      inbox: tempInboxes.get(inboxId),
      emails: [],
      expired: true,
    }
  }
  const emailList: EmailEntry[] = Array.isArray(data) ? data : (data.emails ?? data.email ?? [])
  for (const email of emailList) {
    const messageKey = email.date != null
      ? String(email.date)
      : `${email.subject}-${email.from}`
    const receivedAt = typeof email.date === "number"
      ? new Date(email.date).toISOString()
      : typeof email.date === "string" && !isNaN(Date.parse(email.date))
        ? new Date(email.date).toISOString()
        : new Date().toISOString()
    tempEmailsDb.upsert({
      inbox_id: inboxId,
      message_key: messageKey,
      sender: email.from,
      subject: email.subject,
      text_body: email.body ?? "",
      html_body: email.html ?? "",
      is_read: 0,
      received_at: receivedAt,
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
