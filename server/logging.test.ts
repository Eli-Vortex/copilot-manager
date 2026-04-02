import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Hono } from "hono"

process.env.NODE_ENV = "test"
process.env.MANAGER_DATA_DIR = path.join(tmpdir(), `copilot-manager-tests-${Date.now()}`)
rmSync(process.env.MANAGER_DATA_DIR, { recursive: true, force: true })
mkdirSync(process.env.MANAGER_DATA_DIR, { recursive: true })

let db: typeof import("./db").db
let hashPassword: typeof import("./db").hashPassword
let operationLogs: typeof import("./db").operationLogs
let authRoutes: typeof import("./auth").authRoutes
let api: typeof import("./routes").api
let userApi: typeof import("./routes").userApi
let emailRoutes: typeof import("./email-routes").emailRoutes
let tempmailRoutes: typeof import("./tempmail-routes").tempmailRoutes
let runScheduledEmailSync: typeof import("./main").runScheduledEmailSync
let runOperationLogRetention: typeof import("./main").runOperationLogRetention

const adminUser = { sub: "admin-1", username: "admin-test", role: "admin" }
const normalUser = { sub: "user-1", username: "user-test", role: "user" }

function authedApp(route: Hono, user = adminUser) {
  const app = new Hono<{ Variables: { user: { sub: string; username: string; role: string } } }>()
  app.use("*", async (c, next) => {
    c.set("user", user)
    await next()
  })
  app.route("/", route)
  return app
}

function latestAction(action: string) {
  return operationLogs.list(200).find((row) => row.action === action) ?? null
}

function allLogDetails() {
  return operationLogs.list(200).map((row) => row.details_json).join("\n")
}

function seedAdmin(username = adminUser.username, password = "secret123", role = "admin") {
  db.run("INSERT INTO admin (id, username, password_hash, role) VALUES (?, ?, ?, ?)", [randomUUID(), username, hashPassword(password), role])
}

function resetDb() {
  db.run("DELETE FROM operation_logs")
  db.run("DELETE FROM temp_emails")
  db.run("DELETE FROM temp_inboxes")
  db.run("DELETE FROM emails")
  db.run("DELETE FROM email_accounts")
  db.run("DELETE FROM account_submissions")
  db.run("DELETE FROM accounts")
  db.run("DELETE FROM groups")
  db.run("DELETE FROM admin")
  seedAdmin()
}

beforeAll(async () => {
  ;({ db, hashPassword, operationLogs } = await import("./db"))
  ;({ authRoutes } = await import("./auth"))
  ;({ api, userApi } = await import("./routes"))
  ;({ emailRoutes } = await import("./email-routes"))
  ;({ tempmailRoutes } = await import("./tempmail-routes"))
  ;({ runScheduledEmailSync, runOperationLogRetention } = await import("./main"))
})

beforeEach(() => {
  resetDb()
})

describe("operation log expansion", () => {
  test("auth login success and failure are logged without secret leakage", async () => {
    const successRes = await authRoutes.fetch(new Request("http://test/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: adminUser.username, password: "secret123" }),
    }))
    expect(successRes.status).toBe(200)
    expect(latestAction("auth.login")).toBeTruthy()

    const failureRes = await authRoutes.fetch(new Request("http://test/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: adminUser.username, password: "wrong-password" }),
    }))
    expect(failureRes.status).toBe(401)
    expect(latestAction("auth.login_failed")).toBeTruthy()

    const details = allLogDetails()
    expect(details.includes("wrong-password")).toBe(false)
    expect(details.includes("secret123")).toBe(false)

    const registerRes = await authRoutes.fetch(new Request("http://test/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "new-user", password: "new-secret" }),
    }))
    expect(registerRes.status).toBe(200)
    expect(latestAction("auth.register")).toBeTruthy()

    const loginBody = await successRes.json() as { token: string }
    const changeFailRes = await authRoutes.fetch(new Request("http://test/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${loginBody.token}` },
      body: JSON.stringify({ oldPassword: "bad-old", newPassword: "next-secret" }),
    }))
    expect(changeFailRes.status).toBe(401)
    expect(latestAction("auth.change_password_failed")).toBeTruthy()

    const changeOkRes = await authRoutes.fetch(new Request("http://test/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${loginBody.token}` },
      body: JSON.stringify({ oldPassword: "secret123", newPassword: "next-secret" }),
    }))
    expect(changeOkRes.status).toBe(200)
    expect(latestAction("auth.change_password")).toBeTruthy()
  })

  test("OAuth and system read routes emit logs without leaking tokens", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/login/device/code")) {
        return new Response(JSON.stringify({ device_code: "dev-code-123", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 }), { status: 200 })
      }
      if (url.includes("/login/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "secret-access-token" }), { status: 200 })
      }
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ login: "oauth-user" }), { status: 200 })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const apiApp = authedApp(api)
      const startRes = await apiApp.fetch(new Request("http://test/auth/device-code", { method: "POST" }))
      expect(startRes.status).toBe(200)
      const pollRes = await apiApp.fetch(new Request("http://test/auth/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: "dev-code-123" }),
      }))
      expect(pollRes.status).toBe(200)

      const infoRes = await apiApp.fetch(new Request("http://test/system/info"))
      expect(infoRes.status).toBe(200)

      expect(latestAction("auth.device_code_start")).toBeTruthy()
      expect(latestAction("auth.device_code_complete")).toBeTruthy()
      expect(latestAction("system.info")).toBeTruthy()

      const details = allLogDetails()
      expect(details.includes("secret-access-token")).toBe(false)
      expect(details.includes("dev-code-123")).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("email read/list/unread routes emit logs without storing bodies", async () => {
    const accountId = randomUUID()
    const emailId = randomUUID()
    db.run("INSERT INTO email_accounts (id, name, email, password, imap_host, imap_port, use_tls, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [accountId, "Inbox", "inbox@example.com", "pw", "imap.example.com", 993, 1, ""])
    db.run("INSERT INTO emails (id, account_id, message_id, subject, from_name, from_address, to_address, date, body_text, body_html, is_read, folder, uid, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [emailId, accountId, "msg-1", "hello", "sender", "sender@example.com", "to@example.com", new Date().toISOString(), "", "", 0, "INBOX", null, "imap"])

    const emailApp = authedApp(emailRoutes)
    expect((await emailApp.fetch(new Request("http://test/emails?limit=20&filter=unread"))).status).toBe(200)
    expect((await emailApp.fetch(new Request("http://test/emails/unread-count"))).status).toBe(200)
    expect((await emailApp.fetch(new Request(`http://test/emails/${emailId}`))).status).toBe(200)

    expect(latestAction("emails.list")).toBeTruthy()
    expect(latestAction("emails.unread_count")).toBeTruthy()
    expect(latestAction("emails.read")).toBeTruthy()

    const details = allLogDetails()
    expect(details.includes("body_text")).toBe(false)
    expect(details.includes("body_html")).toBe(false)
  })

  test("tempmail view logs exist and do not leak tokens", async () => {
    const inboxId = randomUUID()
    db.run("INSERT INTO temp_inboxes (id, address, token, expires_at, note, service, status) VALUES (?, ?, ?, ?, ?, ?, ?)", [inboxId, "temp@example.com", "secret-temp-token", new Date(Date.now() + 3600000).toISOString(), "", "tempmail.lol", "active"])
    db.run("INSERT INTO temp_emails (id, inbox_id, message_key, sender, subject, text_body, html_body, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [randomUUID(), inboxId, "msg-temp-1", "sender@example.com", "Temp Subject", "body", "", new Date().toISOString()])

    const tempmailApp = authedApp(tempmailRoutes)
    expect((await tempmailApp.fetch(new Request("http://test/tempmail/inboxes"))).status).toBe(200)
    expect((await tempmailApp.fetch(new Request(`http://test/tempmail/inboxes/${inboxId}/emails`))).status).toBe(200)

    expect(latestAction("tempmail.list")).toBeTruthy()
    expect(latestAction("tempmail.read")).toBeTruthy()
    expect(allLogDetails().includes("secret-temp-token")).toBe(false)
  })

  test("background jobs use system actor and retention removes stale logs", async () => {
    await runScheduledEmailSync()
    const syncLog = latestAction("system.email_sync")
    expect(syncLog).toBeTruthy()
    expect(syncLog?.actor_username).toBe("system")
    expect(syncLog?.actor_role).toBe("system")

    db.run("INSERT INTO operation_logs (id, actor_username, actor_role, action, target_type, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-120 days'))", [randomUUID(), "system", "system", "test.old", "test", "", "{}"])
    expect(operationLogs.list(500).some((row) => row.action === "test.old")).toBe(true)

    runOperationLogRetention(90)

    expect(operationLogs.list(500).some((row) => row.action === "test.old")).toBe(false)
    const retentionLog = latestAction("system.log_retention_cleanup")
    expect(retentionLog).toBeTruthy()
    expect(retentionLog?.actor_username).toBe("system")
  })

  test("submission read endpoints emit logs for user and admin flows", async () => {
    db.run("INSERT INTO admin (id, username, password_hash, role) VALUES (?, ?, ?, ?)", [normalUser.sub, normalUser.username, hashPassword("user-secret"), normalUser.role])
    db.run("INSERT INTO account_submissions (id, user_id, user_username, name, github_token, detected_login, status, user_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [randomUUID(), normalUser.sub, normalUser.username, "Copilot", "gh-token", "login-name", "pending", "note"])

    const userApp = authedApp(userApi, normalUser)
    const adminApp = authedApp(api, adminUser)

    expect((await userApp.fetch(new Request("http://test/account-submissions/me"))).status).toBe(200)
    expect((await adminApp.fetch(new Request("http://test/account-submissions?q=copilot&status=pending"))).status).toBe(200)

    expect(latestAction("submission.list_mine")).toBeTruthy()
    expect(latestAction("submission.list")).toBeTruthy()
  })
})
