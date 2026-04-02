import { Hono } from "hono"
import { emailAccounts, emailsDb, operationLogs } from "./db"
import { testConnection, fetchAndStoreEmails, fetchAllAccounts, fetchEmailBody } from "./email-service"

export const emailRoutes = new Hono()

function logEmailAction(c: { get: (key: string) => unknown }, action: string, target_id = "", details: Record<string, unknown> = {}) {
  const user = c.get("user") as { username?: string; role?: string } | undefined
  operationLogs.create({
    actor_username: user?.username || "system",
    actor_role: user?.role || "system",
    action,
    target_type: "email_account",
    target_id,
    details_json: JSON.stringify(details),
  })
}

emailRoutes.get("/email-accounts", (c) => {
  return c.json(emailAccounts.list())
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

  const emails = emailsDb.list({ account_id, limit, offset, unread_only, has_body, source })
  return c.json(emails)
})

emailRoutes.get("/emails/unread-count", (c) => {
  const count = emailsDb.countUnread()
  return c.json({ count })
})

emailRoutes.post("/emails/mark-all-read", (c) => {
  emailsDb.markAllRead()
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
  if (!email) return c.json({ error: "Email not found" }, 404)

  if (!email.body_text && !email.body_html && email.uid != null) {
    const account = emailAccounts.get(email.account_id)
    if (account) {
      await fetchEmailBody(account, email.uid, email.id, email.folder)
      const updated = emailsDb.get(id)
      if (updated) {
        emailsDb.markRead(id)
        return c.json({ ...updated, is_read: 1 })
      }
    }
  }

  emailsDb.markRead(id)
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
