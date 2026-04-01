import { Hono } from "hono"
import { spawn } from "node:child_process"
import path from "node:path"

import os from "node:os"

import { groups, accounts, dashboard, accountSubmissions } from "./db"
import {
  startInstance,
  stopInstance,
  restartInstance,
  getInstanceStatus,
  getInstanceLogs,
  getAllInstanceStatuses,
  shutdownAll,
} from "./process-manager"

export const api = new Hono()

export const userApi = new Hono()

const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98"
const GITHUB_SCOPES = "read:user"
const GITHUB_BASE = "https://github.com"
const GITHUB_API_BASE = "https://api.github.com"
const oauthHeaders = { "content-type": "application/json", accept: "application/json" }

async function validateGithubCopilotToken(githubToken: string): Promise<{ ok: boolean; login?: string; error?: string }> {
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: { authorization: `token ${githubToken}`, accept: "application/vnd.github+json", "user-agent": "copilot-manager" },
    })
    if (!userRes.ok) return { ok: false, error: "GitHub Token 无效" }
    const user = await userRes.json() as { login?: string }

    const copilotRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
      headers: {
        authorization: `token ${githubToken}`,
        accept: "application/json",
        "user-agent": "copilot-manager",
        "editor-version": "vscode/1.99.0",
      },
    })
    if (!copilotRes.ok) return { ok: false, error: "该账号没有可用的 Copilot 访问权限" }

    return { ok: true, login: user.login || "" }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "校验失败" }
  }
}

const pendingFlows = new Map<string, { device_code: string; interval: number; expires_at: number }>()

api.post("/auth/device-code", async (c) => {
  const res = await fetch(`${GITHUB_BASE}/login/device/code`, {
    method: "POST",
    headers: oauthHeaders,
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPES }),
  })
  if (!res.ok) return c.json({ error: "Failed to get device code from GitHub" }, 502)
  const data = await res.json() as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }
  pendingFlows.set(data.device_code, { device_code: data.device_code, interval: data.interval, expires_at: Date.now() + data.expires_in * 1000 })
  return c.json({ device_code: data.device_code, user_code: data.user_code, verification_uri: data.verification_uri, interval: data.interval })
})

api.post("/auth/poll", async (c) => {
  const { device_code } = await c.req.json<{ device_code: string }>()
  const flow = pendingFlows.get(device_code)
  if (!flow) return c.json({ error: "Unknown device code" }, 400)
  if (Date.now() > flow.expires_at) {
    pendingFlows.delete(device_code)
    return c.json({ status: "expired" })
  }

  const res = await fetch(`${GITHUB_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: oauthHeaders,
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
  })
  if (!res.ok) return c.json({ status: "pending" })
  const data = await res.json() as { access_token?: string; error?: string }

  if (data.access_token) {
    pendingFlows.delete(device_code)
    let username = "unknown"
    try {
      const userRes = await fetch(`${GITHUB_API_BASE}/user`, {
        headers: { authorization: `token ${data.access_token}`, ...oauthHeaders },
      })
      if (userRes.ok) {
        const user = await userRes.json() as { login: string }
        username = user.login
      }
    } catch {}
    return c.json({ status: "complete", access_token: data.access_token, username })
  }

  return c.json({ status: "pending" })
})

api.get("/dashboard", (c) => {
  const summary = dashboard.summary()
  const statuses = getAllInstanceStatuses()
  const runningCount = Object.values(statuses).filter((s) => s.status === "running").length
  const groupNameMap: Record<string, string> = {}
  for (const g of groups.list()) groupNameMap[g.id] = g.name
  const systemInfo = {
    version: PKG_VERSION,
    runtime: `Bun ${typeof Bun !== "undefined" ? Bun.version : "unknown"}`,
    platform: `${os.platform()} ${os.arch()}`,
    uptime: Math.floor(process.uptime()),
    hostname: os.hostname(),
  }
  return c.json({ ...summary, runningInstances: runningCount, instanceStatuses: statuses, groupNames: groupNameMap, systemInfo })
})

api.get("/groups", (c) => {
  const allGroups = groups.list()
  const enriched = allGroups.map((g) => ({
    ...g,
    instance: getInstanceStatus(g.id),
  }))
  return c.json(enriched)
})

api.post("/groups", async (c) => {
  try {
    const body = await c.req.json<{ name: string; description?: string; port: number; auto_start?: boolean }>()
    if (!body.name?.trim()) return c.json({ error: "name is required" }, 400)
    if (!body.port || body.port < 1024 || body.port > 65535) return c.json({ error: "port must be 1024-65535" }, 400)
    const group = groups.create(body)
    return c.json(group, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("UNIQUE constraint")) {
      return c.json({ error: "Group name or port already exists" }, 409)
    }
    return c.json({ error: msg }, 500)
  }
})

api.put("/groups/:id", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json<{ name: string; description?: string; port: number; auto_start?: boolean }>()
    if (!body.name?.trim()) return c.json({ error: "name is required" }, 400)
    if (!body.port || body.port < 1024 || body.port > 65535) return c.json({ error: "port must be 1024-65535" }, 400)
    const group = groups.update(id, body)
    if (!group) return c.json({ error: "Group not found" }, 404)
    return c.json(group)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("UNIQUE constraint")) {
      return c.json({ error: "Group name or port already exists" }, 409)
    }
    return c.json({ error: msg }, 500)
  }
})

api.delete("/groups/:id", (c) => {
  const id = c.req.param("id")
  stopInstance(id)
  const ok = groups.delete(id)
  if (!ok) return c.json({ error: "Group not found" }, 404)
  return c.json({ ok: true })
})

api.post("/groups/:id/start", (c) => {
  const result = startInstance(c.req.param("id"))
  return c.json(result, result.ok ? 200 : 400)
})

api.post("/groups/:id/stop", (c) => {
  const result = stopInstance(c.req.param("id"))
  return c.json(result, result.ok ? 200 : 400)
})

api.post("/groups/:id/restart", (c) => {
  const result = restartInstance(c.req.param("id"))
  return c.json(result, result.ok ? 200 : 400)
})

api.get("/groups/:id/status", (c) => {
  return c.json(getInstanceStatus(c.req.param("id")))
})

api.get("/groups/:id/logs", (c) => {
  const lines = Number(c.req.query("lines")) || 100
  return c.json({ logs: getInstanceLogs(c.req.param("id"), lines) })
})

api.get("/groups/:id/accounts", (c) => {
  return c.json(groups.getAccounts(c.req.param("id")))
})

api.get("/copilot-status-all", async (c) => {
  const allGroups = groups.list()
  const results: Record<string, unknown> = {}
  const fetches = allGroups
    .filter((g) => getInstanceStatus(g.id).status === "running")
    .map(async (g) => {
      try {
        const res = await fetch(`http://127.0.0.1:${g.port}/accounts/status`, { signal: AbortSignal.timeout(8000) })
        if (res.ok) {
          const data = await res.json() as { accounts?: Array<{ name: string }> }
          for (const acc of data.accounts || []) {
            results[acc.name] = { ...acc, _groupName: g.name, _groupPort: g.port }
          }
        }
      } catch {}
    })
  await Promise.all(fetches)
  return c.json(results)
})

api.get("/groups/:id/copilot-status", async (c) => {
  const id = c.req.param("id")
  const status = getInstanceStatus(id)
  if (status.status !== "running") return c.json({ error: "Instance not running" }, 400)
  const group = groups.get(id)
  if (!group) return c.json({ error: "Group not found" }, 404)
  try {
    const res = await fetch(`http://127.0.0.1:${group.port}/accounts/status`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return c.json({ error: `Upstream returned ${res.status}` }, 502)
    const data = await res.json()
    return c.json(data)
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to fetch" }, 502)
  }
})

api.get("/groups/:id/copilot-models", async (c) => {
  const id = c.req.param("id")
  const status = getInstanceStatus(id)
  if (status.status !== "running") return c.json({ error: "Instance not running" }, 400)
  const group = groups.get(id)
  if (!group) return c.json({ error: "Group not found" }, 404)
  try {
    const res = await fetch(`http://127.0.0.1:${group.port}/v1/models`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return c.json({ error: `Upstream returned ${res.status}` }, 502)
    const data = await res.json()
    return c.json(data)
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to fetch" }, 502)
  }
})

api.get("/accounts", (c) => {
  return c.json(accounts.list())
})

api.post("/accounts", async (c) => {
  try {
    const body = await c.req.json<{
      name: string
      github_token: string
      account_type?: string
      tier?: string
      active?: boolean
      group_id?: string | null
    }>()
    if (!body.name?.trim()) return c.json({ error: "name is required" }, 400)
    if (!body.github_token?.trim()) return c.json({ error: "github_token is required" }, 400)
    const account = accounts.create(body)
    return c.json(account, 201)
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

api.put("/accounts/:id", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json<{
      name: string
      github_token: string
      account_type?: string
      tier?: string
      active?: boolean
      group_id?: string | null
    }>()
    if (!body.name?.trim()) return c.json({ error: "name is required" }, 400)
    if (!body.github_token?.trim()) return c.json({ error: "github_token is required" }, 400)
    const account = accounts.update(id, body)
    if (!account) return c.json({ error: "Account not found" }, 404)
    return c.json(account)
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

api.delete("/accounts/:id", (c) => {
  const ok = accounts.delete(c.req.param("id"))
  if (!ok) return c.json({ error: "Account not found" }, 404)
  return c.json({ ok: true })
})

const PROJECT_ROOT = path.resolve(import.meta.dir, "..")
const PKG_VERSION = (() => {
  try { return JSON.parse(require("fs").readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")).version } catch { return "0.0.0" }
})()
let updateLog: string[] = []
let updateRunning = false

function runCommand(cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd })
    let output = ""
    proc.stdout?.on("data", (d: Buffer) => { const s = d.toString(); output += s; updateLog.push(`[stdout] ${s.trimEnd()}`) })
    proc.stderr?.on("data", (d: Buffer) => { const s = d.toString(); output += s; updateLog.push(`[stderr] ${s.trimEnd()}`) })
    proc.on("close", (code) => resolve({ code: code ?? 1, output }))
    proc.on("error", (err) => { updateLog.push(`[error] ${err.message}`); resolve({ code: 1, output: err.message }) })
  })
}

api.get("/system/info", async (c) => {
  let gitBranch = ""
  let gitHash = ""
  let gitMessage = ""
  let gitTime = ""
  let gitRemote = ""
  try {
    const b = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], PROJECT_ROOT)
    gitBranch = b.output.trim()
    const h = await runCommand("git", ["log", "-1", "--format=%h"], PROJECT_ROOT)
    gitHash = h.output.trim()
    const m = await runCommand("git", ["log", "-1", "--format=%s"], PROJECT_ROOT)
    gitMessage = m.output.trim()
    const t = await runCommand("git", ["log", "-1", "--format=%cr"], PROJECT_ROOT)
    gitTime = t.output.trim()
    const r = await runCommand("git", ["remote", "get-url", "origin"], PROJECT_ROOT)
    gitRemote = r.output.trim()
  } catch {}
  return c.json({ version: PKG_VERSION, gitBranch, gitHash, gitMessage, gitTime, gitRemote, updateRunning })
})

api.post("/system/check-update", async (c) => {
  try {
    await runCommand("git", ["fetch", "origin"], PROJECT_ROOT)
    const diff = await runCommand("git", ["log", "HEAD..origin/master", "--oneline"], PROJECT_ROOT)
    const commits = diff.output.trim().split("\n").filter((l) => l.trim())
    const behind = commits.length
    return c.json({ behind, commits: commits.slice(0, 10) })
  } catch {
    return c.json({ behind: 0, commits: [] })
  }
})

api.post("/system/update", async (c) => {
  if (updateRunning) return c.json({ error: "Update already in progress" }, 409)
  updateRunning = true
  updateLog = []

  try {
    updateLog.push("=== Step 0/4: Stopping all instances ===")
    shutdownAll()
    updateLog.push("All instances stopped")

    updateLog.push("=== Step 1/4: git pull ===")
    const pull = await runCommand("git", ["pull"], PROJECT_ROOT)
    if (pull.code !== 0) {
      updateLog.push(`git pull failed (exit ${pull.code})`)
      return c.json({ ok: false, error: "git pull failed", log: updateLog })
    }

    updateLog.push("=== Step 2/4: bun install ===")
    const install = await runCommand(process.execPath, ["install"], PROJECT_ROOT)
    if (install.code !== 0) {
      updateLog.push(`bun install failed (exit ${install.code})`)
      return c.json({ ok: false, error: "bun install failed", log: updateLog })
    }

    updateLog.push("=== Step 3/4: bun run build ===")
    const build = await runCommand(process.execPath, ["run", "build"], PROJECT_ROOT)
    if (build.code !== 0) {
      updateLog.push(`build failed (exit ${build.code})`)
      return c.json({ ok: false, error: "build failed", log: updateLog })
    }

    updateLog.push("=== Step 4/4: Restarting service ===")
    updateLog.push("Service will restart in 2 seconds...")

    setTimeout(() => {
      process.exit(0)
    }, 2000)

    return c.json({ ok: true, log: updateLog })
  } catch (err: unknown) {
    updateLog.push(`Error: ${err instanceof Error ? err.message : String(err)}`)
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err), log: updateLog })
  } finally {
    updateRunning = false
  }
})

api.get("/system/update-log", (c) => {
  return c.json({ log: updateLog, running: updateRunning })
})

userApi.post("/accounts/submit", async (c) => {
  try {
    const user = c.get("user") as { sub?: string; username?: string; role?: string }
    const body = await c.req.json<{ name: string; github_token: string }>()
    if (!user?.sub || !user.username) return c.json({ error: "Unauthorized" }, 401)
    if (!body.name?.trim()) return c.json({ error: "name is required" }, 400)
    if (!body.github_token?.trim()) return c.json({ error: "github_token is required" }, 400)

    const valid = await validateGithubCopilotToken(body.github_token.trim())
    if (!valid.ok) return c.json({ error: valid.error || "账号校验失败" }, 400)

    const submission = accountSubmissions.create({
      user_id: user.sub,
      user_username: user.username,
      name: body.name.trim(),
      github_token: body.github_token.trim(),
      detected_login: valid.login || "",
    })
    return c.json(submission, 201)
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

userApi.get("/account-submissions/me", (c) => {
  const user = c.get("user") as { sub?: string }
  if (!user?.sub) return c.json({ error: "Unauthorized" }, 401)
  return c.json(accountSubmissions.listByUser(user.sub))
})

userApi.post("/account-submissions/validate", async (c) => {
  const body = await c.req.json<{ github_token: string }>()
  if (!body.github_token?.trim()) return c.json({ error: "github_token is required" }, 400)
  const result = await validateGithubCopilotToken(body.github_token.trim())
  return c.json(result, result.ok ? 200 : 400)
})

userApi.post("/account-submissions/:id/cancel", (c) => {
  const user = c.get("user") as { sub?: string }
  if (!user?.sub) return c.json({ error: "Unauthorized" }, 401)
  const updated = accountSubmissions.cancel(c.req.param("id"), user.sub)
  if (!updated) return c.json({ error: "Submission not found" }, 404)
  return c.json(updated)
})

api.get("/account-submissions", (c) => {
  return c.json(accountSubmissions.listAll())
})

api.post("/account-submissions/:id/approve", (c) => {
  const submission = accountSubmissions.get(c.req.param("id"))
  if (!submission) return c.json({ error: "Submission not found" }, 404)
  if (submission.status !== "pending") return c.json({ error: "Only pending submissions can be approved" }, 400)

  const account = accounts.create({
    name: submission.name,
    github_token: submission.github_token,
    group_id: null,
  })
  const updated = accountSubmissions.updateStatus(submission.id, "approved", `已加入账号管理: ${account.id}`)
  return c.json({ submission: updated, account })
})

api.post("/account-submissions/:id/reject", async (c) => {
  const submission = accountSubmissions.get(c.req.param("id"))
  if (!submission) return c.json({ error: "Submission not found" }, 404)
  if (submission.status !== "pending") return c.json({ error: "Only pending submissions can be rejected" }, 400)
  const body = await c.req.json<{ review_note?: string }>()
  const updated = accountSubmissions.updateStatus(submission.id, "rejected", body.review_note?.trim() || "审核拒绝")
  return c.json(updated)
})
