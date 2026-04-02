import { Hono } from "hono"
import { tempInboxes, tempEmailsDb, operationLogs } from "./db"
import { createTempInbox, refreshTempInbox, deleteTempInbox, cleanupExpiredTempInboxes } from "./tempmail-service"

export const tempmailRoutes = new Hono()

function logTempAction(c: { get: (key: string) => unknown }, action: string, target_id = "", details: Record<string, unknown> = {}) {
  const user = c.get("user") as { username?: string; role?: string } | undefined
  operationLogs.create({
    actor_username: user?.username || "system",
    actor_role: user?.role || "system",
    action,
    target_type: "temp_inbox",
    target_id,
    details_json: JSON.stringify(details),
  })
}

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
    const count = Math.min(Math.max(Number(body?.count) || 1, 1), 20)

    if (count === 1) {
      const inbox = await createTempInbox(note)
      logTempAction(c, "tempmail.create", inbox.id, { address: inbox.address })
      return c.json(inbox, 201)
    }

    const results: Awaited<ReturnType<typeof createTempInbox>>[] = []
    const errors: string[] = []
    for (let i = 0; i < count; i++) {
      try {
        const inbox = await createTempInbox(note ? `${note} #${i + 1}` : undefined)
        results.push(inbox)
      } catch (e) {
        errors.push(String(e))
      }
    }
    logTempAction(c, "tempmail.batch_create", "", { count: results.length, errors: errors.length })
    return c.json({ created: results, errors }, 201)
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
    logTempAction(c, "tempmail.update_note", id)
    return c.json(tempInboxes.get(id))
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.delete("/tempmail/inboxes/:id", async (c) => {
  try {
    const id = c.req.param("id")
    await deleteTempInbox(id)
    logTempAction(c, "tempmail.delete", id)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.post("/tempmail/inboxes/cleanup", async (c) => {
  try {
    const deleted = await cleanupExpiredTempInboxes()
    logTempAction(c, "tempmail.cleanup", "", { deleted })
    return c.json({ deleted })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

tempmailRoutes.post("/tempmail/inboxes/:id/refresh", async (c) => {
  try {
    const id = c.req.param("id")
    const result = await refreshTempInbox(id)
    logTempAction(c, "tempmail.refresh", id, { count: result.emails.length, expired: result.expired })
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
