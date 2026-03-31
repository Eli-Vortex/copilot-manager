import { ImapFlow } from "imapflow"
import { emailAccounts, emailsDb, type EmailAccountRow } from "./db"

export async function testConnection(account: EmailAccountRow): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: Boolean(account.use_tls),
    auth: { user: account.email, pass: account.password },
    logger: false,
  })
  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function extractBodyFromSource(source: Buffer): { text: string; html: string } {
  const raw = source.toString("utf8")
  const separatorIndex = raw.indexOf("\r\n\r\n")
  if (separatorIndex === -1) return { text: "", html: "" }

  const rawBody = raw.slice(separatorIndex + 4).trim()
  const looksLikeHtml = /<html|<body|<div|<p[^>]/i.test(rawBody)

  return looksLikeHtml ? { text: "", html: rawBody } : { text: rawBody, html: "" }
}

function extractBody(bodyStructure: Record<string, unknown>, source: Buffer): { text: string; html: string } {
  let text = ""
  let html = ""

  function walkParts(part: Record<string, unknown>): void {
    if (!part) return
    if (part.type === "text") {
      const charset = ((part.parameters as Record<string, string>)?.charset ?? "utf-8") as string
      const encoding: BufferEncoding = charset.toLowerCase() === "utf-8" ? "utf8" : "latin1"
      const raw = source.toString(encoding)
      const bodyStart = raw.indexOf("\r\n\r\n")
      const body = bodyStart !== -1 ? raw.slice(bodyStart + 4).trim() : ""

      if (part.subtype === "plain" && !text) text = body
      else if (part.subtype === "html" && !html) html = body
    }
    if (Array.isArray(part.childNodes)) {
      for (const child of part.childNodes as Record<string, unknown>[]) walkParts(child)
    }
  }

  walkParts(bodyStructure)

  return !text && !html ? extractBodyFromSource(source) : { text, html }
}

export async function fetchAndStoreEmails(
  account: EmailAccountRow,
  folder = "INBOX",
  limit = 50
): Promise<number> {
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: Boolean(account.use_tls),
    auth: { user: account.email, pass: account.password },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder)
    let newCount = 0

    try {
      const mailbox = client.mailbox
      if (!mailbox) return 0

      const total = typeof mailbox.exists === "number" ? mailbox.exists : 0
      if (total === 0) return 0

      const rangeStart = Math.max(1, total - limit + 1)
      const seqRange = `${rangeStart}:${total}`

      const fetched: Array<{
        messageId: string
        subject: string
        fromName: string
        fromAddress: string
        toAddress: string
        date: string
        text: string
        html: string
      }> = []

      for await (const msg of client.fetch(seqRange, {
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        if (!msg.envelope || !msg.source) continue

        const envelope = msg.envelope
        const { text, html } = extractBody(msg.bodyStructure, msg.source)

        fetched.push({
          messageId: envelope.messageId ?? `${account.id}-${msg.seq}`,
          subject: envelope.subject ?? "(no subject)",
          fromName: envelope.from?.[0]?.name ?? "",
          fromAddress: envelope.from?.[0]?.address ?? "",
          toAddress: envelope.to?.[0]?.address ?? "",
          date: envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString(),
          text,
          html,
        })
      }

      for (const m of fetched.reverse()) {
        emailsDb.upsert({
          account_id: account.id,
          message_id: m.messageId,
          subject: m.subject,
          from_name: m.fromName,
          from_address: m.fromAddress,
          to_address: m.toAddress,
          date: m.date,
          body_text: m.text,
          body_html: m.html,
          is_read: 0,
          folder,
        })
        newCount++
      }
    } finally {
      lock.release()
    }

    emailAccounts.setError(account.id, null)
    return newCount
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    emailAccounts.setError(account.id, errMsg)
    throw err
  } finally {
    await client.logout().catch(() => undefined)
  }
}

export async function fetchAllAccounts(): Promise<
  { accountId: string; name: string; newCount: number; error?: string }[]
> {
  const accounts = emailAccounts.list()
  const results: { accountId: string; name: string; newCount: number; error?: string }[] = []

  for (const account of accounts) {
    if (!account.active) continue
    try {
      const newCount = await fetchAndStoreEmails(account)
      results.push({ accountId: account.id, name: account.name, newCount })
    } catch (err) {
      results.push({
        accountId: account.id,
        name: account.name,
        newCount: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
