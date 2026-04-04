import { Hono } from "hono"
import { emailAccounts, emailsDb, operationLogs, tempEmailsDb, tempInboxes, type TempEmailRow, type TempInboxRow } from "./db"
import { testConnection, fetchAndStoreEmails, fetchAllAccounts, fetchEmailBody } from "./email-service"
import { PROVIDER_SERVICE } from "./tempmail-service"

export const emailRoutes = new Hono()

function logEmailAction(c: { get: (key: string) => unknown }, action: string, target_id = "", details: Record<string, unknown> = {}, target_type = "email_account") {
  const user = c.get("user") as { username?: string; role?: string } | undefined
  operationLogs.create({
    actor_username: user?.username || "system",
    actor_role: user?.role || "system",
    action,
    target_type,
    target_id,
    details_json: JSON.stringify(details),
  })
}

function toInboxEmail(tempEmail: TempEmailRow, inbox: TempInboxRow) {
  return {
    id: tempEmail.id,
    account_id: `temp:${inbox.id}`,
    message_id: tempEmail.message_key,
    subject: tempEmail.subject,
    from_name: "",
    from_address: tempEmail.sender,
    to_address: inbox.address,
    date: tempEmail.received_at,
    body_text: tempEmail.text_body,
    body_html: tempEmail.html_body,
    is_read: tempEmail.is_read,
    folder: "INBOX",
    fetched_at: tempEmail.created_at,
    uid: null,
    source: PROVIDER_SERVICE,
    account_name: inbox.note?.trim() || "临时邮箱",
    account_email: inbox.address,
  }
}

function listTempInboxEmails() {
  const inboxes = new Map(tempInboxes.list().map((inbox) => [inbox.id, inbox]))
  return tempEmailsDb.listAll()
    .map((email) => {
      const inbox = inboxes.get(email.inbox_id)
      return inbox ? toInboxEmail(email, inbox) : null
    })
    .filter((email): email is ReturnType<typeof toInboxEmail> => email !== null)
}

emailRoutes.get("/email-accounts", (c) => {
  const rows = emailAccounts.list()
  logEmailAction(c, "email_account.list", "", { count: rows.length })
  return c.json(rows)
})

emailRoutes.post("/email-accounts", async (c) => {
  const body = await c.req.json()
  const { name, email, password, imap_host, imap_port, use_tls, note } = body

  if (!name || !email || !password || !imap_host) {
    return c.json({ error: "name, email, password, and imap_host are required" }, 400)
  }

  const account = emailAccounts.create({
    name,
    email,
    password,
    imap_host,
    imap_port: imap_port ?? 993,
    use_tls: use_tls ?? true,
    note,
  })
  logEmailAction(c, "email_account.create", account.id, { email: account.email, host: account.imap_host })

  return c.json(account, 201)
})

emailRoutes.post("/email-accounts/test", async (c) => {
  const body = await c.req.json()
  const { name, email, password, imap_host, imap_port, use_tls } = body

  const mockAccount = {
    id: "test",
    name: name ?? "",
    email,
    password,
    imap_host,
    imap_port: imap_port ?? 993,
    use_tls: use_tls ? 1 : 0,
    active: 1,
    last_error: null,
    created_at: new Date().toISOString(),
  }

  const result = await testConnection(mockAccount)
  logEmailAction(c, "email_account.test", "", { email, host: imap_host, ok: result.ok })
  return c.json(result)
})

emailRoutes.put("/email-accounts/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json()
  const { name, email, password, imap_host, imap_port, use_tls, note } = body

  if (!name || !email || !imap_host) {
    return c.json({ error: "name, email, and imap_host are required" }, 400)
  }

  const updated = emailAccounts.update(id, {
    name,
    email,
    password,
    imap_host,
    imap_port: imap_port ?? 993,
    use_tls: use_tls ?? true,
    note,
  })

  if (!updated) return c.json({ error: "Account not found" }, 404)
  logEmailAction(c, "email_account.update", updated.id, { email: updated.email, host: updated.imap_host })
  return c.json(updated)
})

emailRoutes.delete("/email-accounts/:id", (c) => {
  const id = c.req.param("id")
  emailAccounts.delete(id)
  logEmailAction(c, "email_account.delete", id)
  return c.json({ ok: true })
})

emailRoutes.get("/emails", (c) => {
  const account_id = c.req.query("account_id")
  const limit = Number(c.req.query("limit") ?? 50)
  const offset = Number(c.req.query("offset") ?? 0)
  const filter = c.req.query("filter")
  const source = c.req.query("source") || undefined

  const unread_only = filter === "unread" || c.req.query("unread_only") === "true"
  const has_body = filter === "has_body" ? true : undefined

  const imapEmails = source === PROVIDER_SERVICE
    ? []
    : emailsDb.list({ account_id, limit: limit + offset, offset: 0, unread_only, has_body, source: source === "imap" ? "imap" : undefined })

  const tempEmails = account_id || source === "imap"
    ? []
    : listTempInboxEmails().filter((email) => {
        if (source && source !== PROVIDER_SERVICE) return false
        if (unread_only && email.is_read !== 0) return false
        if (has_body && !email.body_text && !email.body_html) return false
        return true
      })

  const emails = [...imapEmails, ...tempEmails]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(offset, offset + limit)

  logEmailAction(c, "emails.list", "", { account_id: account_id ?? null, limit, offset, filter: filter ?? null, source: source ?? null, result_count: emails.length }, "email")
  return c.json(emails)
})

emailRoutes.get("/emails/unread-count", (c) => {
  const count = emailsDb.countUnread() + tempEmailsDb.countUnread()
  logEmailAction(c, "emails.unread_count", "", { count }, "email")
  return c.json({ count })
})

emailRoutes.post("/emails/mark-all-read", (c) => {
  emailsDb.markAllRead()
  tempEmailsDb.markAllRead()
  logEmailAction(c, "emails.mark_all_read")
  return c.json({ ok: true })
})

emailRoutes.post("/emails/clear", (c) => {
  emailsDb.clearAll()
  logEmailAction(c, "emails.clear")
  return c.json({ ok: true })
})

emailRoutes.get("/emails/:id", async (c) => {
  const id = c.req.param("id")
  const email = emailsDb.get(id)
  if (!email) {
    const tempEmail = tempEmailsDb.get(id)
    if (!tempEmail) return c.json({ error: "Email not found" }, 404)
    const inbox = tempInboxes.get(tempEmail.inbox_id)
    if (!inbox) return c.json({ error: "Email not found" }, 404)
    tempEmailsDb.markRead(id)
    logEmailAction(c, "emails.read", id, { source: PROVIDER_SERVICE, inbox_id: inbox.id, body_fetched: false, marked_read: tempEmail.is_read !== 1 }, "email")
    return c.json({ ...toInboxEmail({ ...tempEmail, is_read: 1 }, inbox), is_read: 1 })
  }

  if (!email.body_text && !email.body_html && email.uid != null) {
    const account = emailAccounts.get(email.account_id)
    if (account) {
      await fetchEmailBody(account, email.uid, email.id, email.folder)
      const updated = emailsDb.get(id)
      if (updated) {
        emailsDb.markRead(id)
        logEmailAction(c, "emails.read", id, { account_id: updated.account_id, source: updated.source, body_fetched: true, marked_read: updated.is_read !== 1 }, "email")
        return c.json({ ...updated, is_read: 1 })
      }
    }
  }

  emailsDb.markRead(id)
  logEmailAction(c, "emails.read", id, { account_id: email.account_id, source: email.source, body_fetched: false, marked_read: email.is_read !== 1 }, "email")
  return c.json({ ...email, is_read: 1 })
})

emailRoutes.post("/emails/fetch", async (c) => {
  const summary = await fetchAllAccounts()
  logEmailAction(c, "emails.fetch_all", "", { accounts: summary.length })
  return c.json(summary)
})

emailRoutes.post("/emails/fetch/:accountId", async (c) => {
  const accountId = c.req.param("accountId")
  const account = emailAccounts.get(accountId)
  if (!account) return c.json({ error: "Account not found" }, 404)

  const newCount = await fetchAndStoreEmails(account)
  logEmailAction(c, "emails.fetch_one", account.id, { newCount })
  return c.json({ accountId, name: account.name, newCount })
})
