import fs from "node:fs"
import path from "node:path"

import { Hono } from "hono"
import { cors } from "hono/cors"

import { api } from "./routes"

const app = new Hono()
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
app.route("/api", api)

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

export default {
  port,
  fetch: app.fetch,
}
