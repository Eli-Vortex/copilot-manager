import { Hono } from "hono"
import { createHash, randomBytes } from "node:crypto"

import { db, hashPassword, verifyPassword, JWT_SECRET } from "./db"

export const authRoutes = new Hono()

function signJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString("base64url")
  const sig = createHash("sha256").update(`${header}.${body}.${JWT_SECRET}`).digest("base64url")
  return `${header}.${body}.${sig}`
}

export function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".")
    const expectedSig = createHash("sha256").update(`${header}.${body}.${JWT_SECRET}`).digest("base64url")
    if (sig !== expectedSig) return null
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

authRoutes.post("/login", async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()
  if (!username || !password) return c.json({ error: "用户名和密码不能为空" }, 400)

  const user = db.prepare<{ id: string; username: string; password_hash: string }, [string]>(
    "SELECT id, username, password_hash FROM admin WHERE username = ?"
  ).get(username)

  if (!user || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: "用户名或密码错误" }, 401)
  }

  const token = signJwt({ sub: user.id, username: user.username })
  return c.json({ token, username: user.username })
})

function getUserFromRequest(c: { req: { header: (name: string) => string | undefined } }): Record<string, unknown> | null {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  return verifyJwt(authHeader.slice(7))
}

authRoutes.get("/me", (c) => {
  const user = getUserFromRequest(c)
  if (!user) return c.json({ error: "Unauthorized" }, 401)
  return c.json({ username: user.username })
})

authRoutes.post("/change-password", async (c) => {
  const user = getUserFromRequest(c)
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const { oldPassword, newPassword } = await c.req.json<{ oldPassword: string; newPassword: string }>()
  if (!oldPassword || !newPassword) return c.json({ error: "旧密码和新密码不能为空" }, 400)
  if (newPassword.length < 6) return c.json({ error: "新密码至少 6 位" }, 400)

  const admin = db.prepare<{ password_hash: string }, [string]>(
    "SELECT password_hash FROM admin WHERE id = ?"
  ).get(user.sub as string)

  if (!admin || !verifyPassword(oldPassword, admin.password_hash)) {
    return c.json({ error: "旧密码错误" }, 401)
  }

  db.run("UPDATE admin SET password_hash = ? WHERE id = ?", [hashPassword(newPassword), user.sub as string])
  return c.json({ ok: true })
})
