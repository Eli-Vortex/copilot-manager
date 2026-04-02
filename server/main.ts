import fs from "node:fs"
import path from "node:path"

import { Hono } from "hono"
import { cors } from "hono/cors"

import { api, userApi } from "./routes"
import { authRoutes, verifyJwt, requireAdmin } from "./auth"
import { groups, operationLogs } from "./db"
import { startInstance } from "./process-manager"
import { emailRoutes } from "./email-routes"
import { tempmailRoutes } from "./tempmail-routes"

type AppEnv = { Variables: { user: Record<string, unknown> } }

const app = new Hono<AppEnv>()
const distDir = path.resolve(import.meta.dir, "..", "dist")

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
}

app.use(cors())

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }))

app.route("/api/auth", authRoutes)

app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  const payload = verifyJwt(authHeader.slice(7))
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  c.set("user", payload)
  await next()
})

app.route("/api", userApi)

app.use("/api/emails*", requireAdmin)
app.use("/api/email-accounts*", requireAdmin)
app.use("/api/account-submissions*", requireAdmin)
app.use("/api/system/*", requireAdmin)
app.use("/api/groups*", requireAdmin)
app.use("/api/accounts*", requireAdmin)
app.use("/api/copilot*", requireAdmin)
app.use("/api/tempmail*", requireAdmin)

app.route("/api", api)
app.route("/api", emailRoutes)
app.route("/api", tempmailRoutes)

if (fs.existsSync(distDir)) {
  app.get("/*", (c) => {
    const reqPath = c.req.path === "/" ? "/index.html" : c.req.path
    const filePath = path.join(distDir, reqPath)

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      const headers: Record<string, string> = { "Content-Type": MIME[ext] || "application/octet-stream" }
      if (reqPath.match(/\.[a-f0-9]{8,}\.(js|css)$/)) {
        headers["Cache-Control"] = "public, max-age=31536000, immutable"
      }
      return new Response(Bun.file(filePath), { headers })
    }

    return new Response(Bun.file(path.join(distDir, "index.html")), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
    })
  })
}

const port = Number(process.env.MANAGER_PORT) || 3000

console.log(`Copilot Manager running at http://localhost:${port}`)

function logSystemAction(action: string, target_type: string, target_id = "", details: Record<string, unknown> = {}) {
  operationLogs.create({
    actor_username: "system",
    actor_role: "system",
    action,
    target_type,
    target_id,
    details_json: JSON.stringify(details),
  })
}

export function runAutoStartScan() {
  const allGroups = groups.list()
  const autoGroups = allGroups.filter((g) => Number(g.auto_start) === 1)
  console.log(`[auto-start] Found ${allGroups.length} groups, ${autoGroups.length} marked auto-start`)
  logSystemAction("system.auto_start_scan", "scheduler", "", { total_groups: allGroups.length, auto_start_count: autoGroups.length })
  for (const g of autoGroups) {
    console.log(`[auto-start] Starting: ${g.name} (port ${g.port})`)
    const result = startInstance(g.id)
    console.log(`[auto-start] ${g.name}: ${result.ok ? "ok" : result.error}`)
    logSystemAction("system.auto_start_group", "group", g.id, { group_name: g.name, port: g.port, success: result.ok, error: result.ok ? null : result.error })
  }
}

export async function runScheduledEmailSync() {
  const { fetchAllAccounts } = await import("./email-service")
  try {
    await fetchAllAccounts()
    logSystemAction("system.email_sync", "scheduler", "", { status: "success" })
  } catch (error) {
    logSystemAction("system.email_sync_failed", "scheduler", "", { error: error instanceof Error ? error.message : String(error) })
  }
}

export function runOperationLogRetention(retentionDays = 90) {
  logSystemAction("system.log_retention_cleanup", "scheduler", "", { retention_days: retentionDays })
  operationLogs.deleteOlderThan(retentionDays)
}

if (process.env.NODE_ENV !== "test") {
  setTimeout(() => {
    runAutoStartScan()
  }, 3000)

  setInterval(async () => {
    await runScheduledEmailSync()
  }, 5 * 60 * 1000)

  setInterval(() => {
    runOperationLogRetention(90)
  }, 24 * 60 * 60 * 1000)
}

export default {
  port,
  fetch: app.fetch,
}
