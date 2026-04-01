import fs from "node:fs"
import path from "node:path"

import { Hono } from "hono"
import { cors } from "hono/cors"

import { api, userApi } from "./routes"
import { authRoutes, verifyJwt, requireAdmin } from "./auth"
import { groups } from "./db"
import { startInstance } from "./process-manager"
import { emailRoutes } from "./email-routes"

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

app.route("/api", api)
app.route("/api", emailRoutes)

if (fs.existsSync(distDir)) {
  app.get("/*", (c) => {
    const reqPath = c.req.path === "/" ? "/index.html" : c.req.path
    const filePath = path.join(distDir, reqPath)

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      return new Response(Bun.file(filePath), {
        headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
      })
    }

    return new Response(Bun.file(path.join(distDir, "index.html")), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  })
}

const port = Number(process.env.MANAGER_PORT) || 3000

console.log(`Copilot Manager running at http://localhost:${port}`)

setTimeout(() => {
  const allGroups = groups.list()
  const autoGroups = allGroups.filter((g) => Number(g.auto_start) === 1)
  console.log(`[auto-start] Found ${allGroups.length} groups, ${autoGroups.length} marked auto-start`)
  for (const g of autoGroups) {
    console.log(`[auto-start] Starting: ${g.name} (port ${g.port})`)
    const result = startInstance(g.id)
    console.log(`[auto-start] ${g.name}: ${result.ok ? "ok" : result.error}`)
  }
}, 3000)

setInterval(async () => {
  const { fetchAllAccounts } = await import("./email-service")
  fetchAllAccounts().catch(() => undefined)
}, 5 * 60 * 1000)

export default {
  port,
  fetch: app.fetch,
}
