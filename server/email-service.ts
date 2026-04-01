import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
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

export async function fetchAndStoreEmails(
  account: EmailAccountRow,
  folder = "INBOX",
  limit = 30
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
      const since = new Date()
      since.setDate(since.getDate() - 30)

      const uids = await client.search({ since }, { uid: true })
      if (uids.length === 0) {
        emailsDb.clearAccount(account.id)
        return 0
      }

      const recentUids = uids.slice(-limit)
      const uidRange = recentUids.join(",")

      const fetched: Array<{
        uid: number
        messageId: string
        subject: string
        fromName: string
        fromAddress: string
        toAddress: string
        date: string
      }> = []

      for await (const msg of client.fetch(uidRange, {
        envelope: true,
        internalDate: true,
        uid: true,
      })) {
        if (!msg.envelope) continue

        const envelope = msg.envelope
        const isoDate = envelope.date ?
          new Date(envelope.date).toISOString()
          : msg.internalDate ?
            new Date(msg.internalDate).toISOString()
            : ""

        fetched.push({
          uid: msg.uid,
          messageId: envelope.messageId ?? `${account.id}-${msg.uid}`,
          subject: envelope.subject || "(no subject)",
          fromName: envelope.from?.[0]?.name || "",
          fromAddress: envelope.from?.[0]?.address || "",
          toAddress: envelope.to?.[0]?.address ?? "",
          date: isoDate,
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
          body_text: "",
          body_html: "",
          is_read: 0,
          folder,
          uid: m.uid,
        })
        newCount++
      }

      emailsDb.keepOnlyMessageIds(account.id, fetched.map((m) => m.messageId))
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

export async function fetchEmailBody(
  account: EmailAccountRow,
  uid: number,
  emailId: string,
  folder = "INBOX"
): Promise<void> {
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
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
      if (msg && msg.source) {
        const parsed = await simpleParser(msg.source)
        emailsDb.updateBody(emailId, parsed.text || "", parsed.html || "")
      }
    } finally {
      lock.release()
    }
    emailAccounts.setError(account.id, null)
  } catch (err) {
    emailAccounts.setError(account.id, err instanceof Error ? err.message : String(err))
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
