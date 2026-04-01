import { Hono } from "hono"
import { tempInboxes, tempEmailsDb } from "./db"
import { createTempInbox, refreshTempInbox, deleteTempInbox, cleanupExpiredTempInboxes } from "./tempmail-service"

export const tempmailRoutes = new Hono()

tempmailRoutes.get("/tempmail/inboxes", async (c) => {
  try {
    await cleanupExpiredTempInboxes()
    return c.json(tempInboxes.list())
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.post("/tempmail/inboxes", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
    const note = typeof body?.note === "string" ? body.note : undefined
    const inbox = await createTempInbox(note)
    return c.json(inbox, 201)
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.patch("/tempmail/inboxes/:id/note", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json()
    const existing = tempInboxes.get(id)
    if (!existing) return c.json({ error: "Inbox not found" }, 404)
    tempInboxes.updateNote(id, body?.note ?? "")
    return c.json(tempInboxes.get(id))
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.delete("/tempmail/inboxes/:id", async (c) => {
  try {
    const id = c.req.param("id")
    await deleteTempInbox(id)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.post("/tempmail/inboxes/cleanup", async (c) => {
  try {
    const deleted = await cleanupExpiredTempInboxes()
    return c.json({ deleted })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.post("/tempmail/inboxes/:id/refresh", async (c) => {
  try {
    const id = c.req.param("id")
    const result = await refreshTempInbox(id)
    return c.json(result)
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.get("/tempmail/inboxes/:id/emails", (c) => {
  try {
    const id = c.req.param("id")
    const inbox = tempInboxes.get(id)
    if (!inbox) return c.json({ error: "Inbox not found" }, 404)
    return c.json({ inbox, emails: tempEmailsDb.listByInbox(id) })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})
