import { Database } from "bun:sqlite"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const DATA_DIR = process.env.MANAGER_DATA_DIR || path.join(import.meta.dir, "..", "data")
const DB_PATH = path.join(DATA_DIR, "manager.db")

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.run("PRAGMA journal_mode = WAL")
db.run("PRAGMA foreign_keys = ON")

db.run(`
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    port INTEGER NOT NULL UNIQUE,
    auto_start INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    github_token TEXT NOT NULL,
    account_type TEXT DEFAULT 'individual',
    tier TEXT DEFAULT 'pro',
    active INTEGER DEFAULT 1,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS admin (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`)
try { db.run("ALTER TABLE admin ADD COLUMN role TEXT DEFAULT 'admin'") } catch { void 0 }

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = createHash("sha256").update(salt + password).digest("hex")
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  return createHash("sha256").update(salt + password).digest("hex") === hash
}

function getJwtSecret(): string {
  const row = db.prepare<{ value: string }, []>("SELECT value FROM settings WHERE key = 'jwt_secret'").get()
  if (row) return row.value
  const secret = randomBytes(32).toString("hex")
  db.run("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)", [secret])
  return secret
}

function initAdmin(): string | null {
  const existing = db.prepare<{ id: string }, []>("SELECT id FROM admin LIMIT 1").get()
  if (existing) return null
  const password = randomBytes(8).toString("hex")
  const id = randomUUID()
  db.run("INSERT INTO admin (id, username, password_hash) VALUES (?, ?, ?)", [id, "admin", hashPassword(password)])
  return password
}

const JWT_SECRET = getJwtSecret()
const INIT_PASSWORD = initAdmin()
if (INIT_PASSWORD) {
  console.log(`\n  ╔════════════════════════════════════════╗`)
  console.log(`  ║  Admin initial password: ${INIT_PASSWORD}  ║`)
  console.log(`  ║  Username: admin                       ║`)
  console.log(`  ╚════════════════════════════════════════╝\n`)
}

export { db, hashPassword, verifyPassword, JWT_SECRET }

export interface GroupRow {
  id: string
  name: string
  description: string
  port: number
  auto_start: number
  created_at: string
  updated_at: string
}

export interface AccountRow {
  id: string
  name: string
  github_token: string
  account_type: string
  tier: string
  active: number
  group_id: string | null
  created_at: string
  updated_at: string
}

export interface GroupWithCounts extends GroupRow {
  account_count: number
}

const stmts = {
  listGroups: db.prepare<GroupWithCounts, []>(`
    SELECT g.*, COUNT(a.id) as account_count
    FROM groups g LEFT JOIN accounts a ON a.group_id = g.id
    GROUP BY g.id ORDER BY g.created_at DESC
  `),

  getGroup: db.prepare<GroupRow, [string]>("SELECT * FROM groups WHERE id = ?"),

  insertGroup: db.prepare<void, [string, string, string, number, number]>(
    "INSERT INTO groups (id, name, description, port, auto_start) VALUES (?, ?, ?, ?, ?)"
  ),

  updateGroup: db.prepare<void, [string, string, number, number, string]>(
    "UPDATE groups SET name = ?, description = ?, port = ?, auto_start = ?, updated_at = datetime('now') WHERE id = ?"
  ),

  deleteGroup: db.prepare<void, [string]>("DELETE FROM groups WHERE id = ?"),

  listAccounts: db.prepare<AccountRow, []>("SELECT * FROM accounts ORDER BY created_at DESC"),

  listAccountsByGroup: db.prepare<AccountRow, [string]>(
    "SELECT * FROM accounts WHERE group_id = ? ORDER BY created_at DESC"
  ),

  getAccount: db.prepare<AccountRow, [string]>("SELECT * FROM accounts WHERE id = ?"),

  insertAccount: db.prepare<void, [string, string, string, string, string, number, string | null]>(
    "INSERT INTO accounts (id, name, github_token, account_type, tier, active, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),

  updateAccount: db.prepare<void, [string, string, string, string, number, string | null, string]>(
    "UPDATE accounts SET name = ?, github_token = ?, account_type = ?, tier = ?, active = ?, group_id = ?, updated_at = datetime('now') WHERE id = ?"
  ),

  deleteAccount: db.prepare<void, [string]>("DELETE FROM accounts WHERE id = ?"),

  countGroups: db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM groups"),
  countAccounts: db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM accounts"),
  countActiveAccounts: db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM accounts WHERE active = 1"),
}

export const groups = {
  list(): GroupWithCounts[] {
    return stmts.listGroups.all()
  },

  get(id: string): GroupRow | null {
    return stmts.getGroup.get(id) ?? null
  },

  create(data: { name: string; description?: string; port: number; auto_start?: boolean }): GroupRow {
    const id = randomUUID()
    stmts.insertGroup.run(id, data.name, data.description || "", data.port, data.auto_start ? 1 : 0)
    return stmts.getGroup.get(id)!
  },

  update(id: string, data: { name: string; description?: string; port: number; auto_start?: boolean }): GroupRow | null {
    stmts.updateGroup.run(data.name, data.description || "", data.port, data.auto_start ? 1 : 0, id)
    return stmts.getGroup.get(id) ?? null
  },

  delete(id: string): boolean {
    const group = stmts.getGroup.get(id)
    if (!group) return false
    stmts.deleteGroup.run(id)
    return true
  },

  getAccounts(groupId: string): AccountRow[] {
    return stmts.listAccountsByGroup.all(groupId)
  },
}

export const accounts = {
  list(): AccountRow[] {
    return stmts.listAccounts.all()
  },

  get(id: string): AccountRow | null {
    return stmts.getAccount.get(id) ?? null
  },

  create(data: {
    name: string
    github_token: string
    account_type?: string
    tier?: string
    active?: boolean
    group_id?: string | null
  }): AccountRow {
    const id = randomUUID()
    stmts.insertAccount.run(
      id,
      data.name,
      data.github_token,
      data.account_type || "individual",
      data.tier || "pro",
      data.active !== false ? 1 : 0,
      data.group_id || null
    )
    return stmts.getAccount.get(id)!
  },

  update(id: string, data: {
    name: string
    github_token: string
    account_type?: string
    tier?: string
    active?: boolean
    group_id?: string | null
  }): AccountRow | null {
    stmts.updateAccount.run(
      data.name,
      data.github_token,
      data.account_type || "individual",
      data.tier || "pro",
      data.active !== false ? 1 : 0,
      data.group_id || null,
      id
    )
    return stmts.getAccount.get(id) ?? null
  },

  delete(id: string): boolean {
    const account = stmts.getAccount.get(id)
    if (!account) return false
    stmts.deleteAccount.run(id)
    return true
  },
}

export const dashboard = {
  summary() {
    return {
      totalGroups: stmts.countGroups.get()!.count,
      totalAccounts: stmts.countAccounts.get()!.count,
      activeAccounts: stmts.countActiveAccounts.get()!.count,
    }
  },
}

export { DATA_DIR }

db.run(`
  CREATE TABLE IF NOT EXISTS email_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    imap_host TEXT NOT NULL,
    imap_port INTEGER DEFAULT 993,
    use_tls INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    note TEXT DEFAULT '',
    last_error TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`)
try { db.run("ALTER TABLE email_accounts ADD COLUMN note TEXT DEFAULT ''") } catch { void 0 }

db.run(`
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    subject TEXT DEFAULT '',
    from_name TEXT DEFAULT '',
    from_address TEXT DEFAULT '',
    to_address TEXT DEFAULT '',
    date TEXT DEFAULT '',
    body_text TEXT DEFAULT '',
    body_html TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0,
    folder TEXT DEFAULT 'INBOX',
    fetched_at TEXT DEFAULT (datetime('now')),
    UNIQUE(account_id, message_id)
  )
`)
try { db.run("ALTER TABLE emails ADD COLUMN uid INTEGER") } catch { void 0 }
db.run("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)")
db.run("CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)")

db.run(`
  CREATE TABLE IF NOT EXISTS account_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
    user_username TEXT NOT NULL,
    name TEXT NOT NULL,
    github_token TEXT NOT NULL,
    detected_login TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)
db.run("CREATE INDEX IF NOT EXISTS idx_account_submissions_user ON account_submissions(user_id)")
db.run("CREATE INDEX IF NOT EXISTS idx_account_submissions_status ON account_submissions(status)")

export interface EmailAccountRow {
  id: string
  name: string
  email: string
  password: string
  imap_host: string
  imap_port: number
  use_tls: number
  active: number
  note: string
  last_error: string | null
  created_at: string
}

export interface EmailRow {
  id: string
  account_id: string
  message_id: string
  subject: string
  from_name: string
  from_address: string
  to_address: string
  date: string
  body_text: string
  body_html: string
  is_read: number
  folder: string
  fetched_at: string
  uid: number | null
  source: string
}

export interface AccountSubmissionRow {
  id: string
  user_id: string
  user_username: string
  name: string
  github_token: string
  detected_login: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  review_note: string
  user_note: string
  assigned_group_id: string | null
  created_at: string
  updated_at: string
}

export const emailAccounts = {
  list: () => db.prepare<EmailAccountRow, []>("SELECT * FROM email_accounts ORDER BY created_at DESC").all(),
  get: (id: string) => db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id) ?? null,
  create: (data: { name: string; email: string; password: string; imap_host: string; imap_port: number; use_tls: boolean; note?: string }) => {
    const id = randomUUID()
    db.run("INSERT INTO email_accounts (id, name, email, password, imap_host, imap_port, use_tls, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, data.name, data.email, data.password, data.imap_host, data.imap_port, data.use_tls ? 1 : 0, data.note || ""])
    return db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id)!
  },
  update: (id: string, data: { name: string; email: string; password?: string; imap_host: string; imap_port: number; use_tls: boolean; note?: string }) => {
    const current = db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id)
    if (!current) return null
    db.run("UPDATE email_accounts SET name=?, email=?, password=?, imap_host=?, imap_port=?, use_tls=?, note=? WHERE id=?",
      [data.name, data.email, data.password?.trim() ? data.password : current.password, data.imap_host, data.imap_port, data.use_tls ? 1 : 0, data.note || "", id])
    return db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id) ?? null
  },
  delete: (id: string) => { db.run("DELETE FROM email_accounts WHERE id = ?", [id]) },
  setError: (id: string, err: string | null) => db.run("UPDATE email_accounts SET last_error = ? WHERE id = ?", [err, id]),
}

export const emailsDb = {
  list: (opts: { account_id?: string; limit?: number; offset?: number; unread_only?: boolean; has_body?: boolean; source?: string }) => {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.account_id) { where.push("e.account_id = ?"); params.push(opts.account_id) }
    if (opts.unread_only) { where.push("e.is_read = 0") }
    if (opts.has_body) { where.push("(e.body_text != '' OR e.body_html != '')") }
    if (opts.source) { where.push("e.source = ?"); params.push(opts.source) }
    const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : ""
    const limit = opts.limit ?? 50
    const offset = opts.offset ?? 0
    return db.prepare<EmailRow & { account_name: string; account_email: string }, (string | number)[]>(
      `SELECT e.*, a.name as account_name, a.email as account_email FROM emails e
       JOIN email_accounts a ON a.id = e.account_id
       ${whereStr} ORDER BY e.date DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset)
  },
  get: (id: string) => db.prepare<EmailRow, [string]>("SELECT * FROM emails WHERE id = ?").get(id) ?? null,
  markRead: (id: string) => db.run("UPDATE emails SET is_read = 1 WHERE id = ?", [id]),
  countUnread: () => (db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM emails WHERE is_read = 0").get()?.count ?? 0),
  upsert: (row: Omit<EmailRow, "fetched_at" | "id" | "source"> & { source?: string }) => {
    db.run(`INSERT INTO emails (id, account_id, message_id, subject, from_name, from_address, to_address, date, body_text, body_html, is_read, folder, uid, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id, message_id) DO UPDATE SET
              subject = excluded.subject,
              from_name = excluded.from_name,
              from_address = excluded.from_address,
              to_address = excluded.to_address,
              date = excluded.date,
              body_text = CASE WHEN excluded.body_text != '' THEN excluded.body_text ELSE emails.body_text END,
              body_html = CASE WHEN excluded.body_html != '' THEN excluded.body_html ELSE emails.body_html END,
              is_read = CASE WHEN emails.is_read = 1 THEN 1 ELSE excluded.is_read END,
              folder = excluded.folder,
              uid = excluded.uid,
              source = excluded.source`,
      [randomUUID(), row.account_id, row.message_id, row.subject, row.from_name, row.from_address, row.to_address, row.date, row.body_text, row.body_html, row.is_read, row.folder, row.uid ?? null, row.source ?? "imap"])
  },
  updateBody: (id: string, text: string, html: string) => {
    db.run("UPDATE emails SET body_text = ?, body_html = ? WHERE id = ?", [text, html, id])
  },
  clearAll: () => {
    db.run("DELETE FROM emails")
  },
  clearAccount: (accountId: string) => {
    db.run("DELETE FROM emails WHERE account_id = ?", [accountId])
  },
  keepOnlyMessageIds: (accountId: string, messageIds: string[]) => {
    if (messageIds.length === 0) {
      db.run("DELETE FROM emails WHERE account_id = ?", [accountId])
      return
    }
    const placeholders = messageIds.map(() => "?").join(",")
    db.run(
      `DELETE FROM emails WHERE account_id = ? AND message_id NOT IN (${placeholders})`,
      [accountId, ...messageIds],
    )
  },
  markAllRead: () => {
    db.run("UPDATE emails SET is_read = 1 WHERE is_read = 0")
  },
  countAll: () => (db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM emails").get()?.count ?? 0),
}

export const accountSubmissions = {
  listAll: () => db.prepare<AccountSubmissionRow, []>("SELECT * FROM account_submissions ORDER BY created_at DESC").all(),
  listByUser: (userId: string) => db.prepare<AccountSubmissionRow, [string]>("SELECT * FROM account_submissions WHERE user_id = ? ORDER BY created_at DESC").all(userId),
  get: (id: string) => db.prepare<AccountSubmissionRow, [string]>("SELECT * FROM account_submissions WHERE id = ?").get(id) ?? null,
  create: (data: { user_id: string; user_username: string; name: string; github_token: string; detected_login: string; user_note?: string }) => {
    const id = randomUUID()
    db.run(
      "INSERT INTO account_submissions (id, user_id, user_username, name, github_token, detected_login, user_note) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, data.user_id, data.user_username, data.name, data.github_token, data.detected_login, data.user_note ?? ""],
    )
    return db.prepare<AccountSubmissionRow, [string]>("SELECT * FROM account_submissions WHERE id = ?").get(id)!
  },
  updateStatus: (id: string, status: AccountSubmissionRow["status"], reviewNote = "", assignedGroupId: string | null = null) => {
    db.run(
      "UPDATE account_submissions SET status = ?, review_note = ?, assigned_group_id = COALESCE(?, assigned_group_id), updated_at = datetime('now') WHERE id = ?",
      [status, reviewNote, assignedGroupId, id],
    )
    return db.prepare<AccountSubmissionRow, [string]>("SELECT * FROM account_submissions WHERE id = ?").get(id) ?? null
  },
  cancel: (id: string, userId: string) => {
    db.run(
      "UPDATE account_submissions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'pending'",
      [id, userId],
    )
    return db.prepare<AccountSubmissionRow, [string]>("SELECT * FROM account_submissions WHERE id = ?").get(id) ?? null
  },
  deleteOne: (id: string) => db.run("DELETE FROM account_submissions WHERE id = ?", [id]),
  deleteMany: (ids: string[]) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => "?").join(",")
    db.run(`DELETE FROM account_submissions WHERE id IN (${placeholders})`, ids)
  },
}

try { db.run("ALTER TABLE account_submissions ADD COLUMN user_note TEXT DEFAULT ''") } catch { void 0 }
try { db.run("ALTER TABLE account_submissions ADD COLUMN assigned_group_id TEXT DEFAULT NULL") } catch { void 0 }
try { db.run("ALTER TABLE emails ADD COLUMN source TEXT DEFAULT 'imap'") } catch { void 0 }

db.run(`
  CREATE TABLE IF NOT EXISTS temp_inboxes (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'tempmail.lol',
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS temp_emails (
    id TEXT PRIMARY KEY,
    inbox_id TEXT NOT NULL REFERENCES temp_inboxes(id) ON DELETE CASCADE,
    message_key TEXT NOT NULL,
    sender TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    text_body TEXT DEFAULT '',
    html_body TEXT DEFAULT '',
    received_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(inbox_id, message_key)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS operation_logs (
    id TEXT PRIMARY KEY,
    actor_username TEXT DEFAULT '',
    actor_role TEXT DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT DEFAULT '',
    target_id TEXT DEFAULT '',
    details_json TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )
`)

db.run("CREATE INDEX IF NOT EXISTS idx_temp_emails_inbox ON temp_emails(inbox_id)")
db.run("CREATE INDEX IF NOT EXISTS idx_temp_emails_received ON temp_emails(received_at DESC)")
db.run("CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at DESC)")
db.run("CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action)")

export interface TempInboxRow {
  id: string
  address: string
  token: string
  service: string
  status: string
  expires_at: string
  note: string
  created_at: string
}

export interface TempEmailRow {
  id: string
  inbox_id: string
  message_key: string
  sender: string
  subject: string
  text_body: string
  html_body: string
  received_at: string
  created_at: string
}

export interface OperationLogRow {
  id: string
  actor_username: string
  actor_role: string
  action: string
  target_type: string
  target_id: string
  details_json: string
  created_at: string
}

export const tempInboxes = {
  list: () => db.prepare<TempInboxRow, []>("SELECT * FROM temp_inboxes ORDER BY created_at DESC").all(),
  get: (id: string) => db.prepare<TempInboxRow, [string]>("SELECT * FROM temp_inboxes WHERE id = ?").get(id) ?? null,
  create: (data: { address: string; token: string; expires_at: string; note?: string; service?: string }) => {
    const id = randomUUID()
    db.run(
      "INSERT INTO temp_inboxes (id, address, token, expires_at, note, service) VALUES (?, ?, ?, ?, ?, ?)",
      [id, data.address, data.token, data.expires_at, data.note ?? "", data.service ?? "tempmail.lol"]
    )
    return db.prepare<TempInboxRow, [string]>("SELECT * FROM temp_inboxes WHERE id = ?").get(id)!
  },
  updateNote: (id: string, note: string) => db.run("UPDATE temp_inboxes SET note = ? WHERE id = ?", [note, id]),
  updateStatus: (id: string, status: string) => db.run("UPDATE temp_inboxes SET status = ? WHERE id = ?", [status, id]),
  delete: (id: string) => db.run("DELETE FROM temp_inboxes WHERE id = ?", [id]),
  deleteExpired: (nowIso: string) => db.run("DELETE FROM temp_inboxes WHERE expires_at < ?", [nowIso]),
}

export const tempEmailsDb = {
  listByInbox: (inboxId: string) => db.prepare<TempEmailRow, [string]>("SELECT * FROM temp_emails WHERE inbox_id = ? ORDER BY received_at DESC").all(inboxId),
  upsert: (data: Omit<TempEmailRow, "id" | "created_at">) => {
    db.run(
      `INSERT INTO temp_emails (id, inbox_id, message_key, sender, subject, text_body, html_body, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(inbox_id, message_key) DO UPDATE SET
         sender = excluded.sender,
         subject = excluded.subject,
         text_body = CASE WHEN excluded.text_body != '' THEN excluded.text_body ELSE temp_emails.text_body END,
         html_body = CASE WHEN excluded.html_body != '' THEN excluded.html_body ELSE temp_emails.html_body END,
         received_at = excluded.received_at`,
      [randomUUID(), data.inbox_id, data.message_key, data.sender, data.subject, data.text_body, data.html_body, data.received_at]
    )
  },
  deleteByInbox: (inboxId: string) => db.run("DELETE FROM temp_emails WHERE inbox_id = ?", [inboxId]),
  countAll: () => (db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM temp_emails").get()?.count ?? 0),
}

export const operationLogs = {
  list: (limit = 100) => db.prepare<OperationLogRow, [number]>("SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ?").all(limit),
  create: (data: Omit<OperationLogRow, "id" | "created_at">) => {
    const id = randomUUID()
    db.run(
      "INSERT INTO operation_logs (id, actor_username, actor_role, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, data.actor_username, data.actor_role, data.action, data.target_type, data.target_id, data.details_json]
    )
    return db.prepare<OperationLogRow, [string]>("SELECT * FROM operation_logs WHERE id = ?").get(id)!
  },
  countAll: () => (db.prepare<{ count: number }, []>("SELECT COUNT(*) as count FROM operation_logs").get()?.count ?? 0),
  deleteOlderThan: (days: number) => db.run("DELETE FROM operation_logs WHERE created_at < datetime('now', ?)", [`-${days} days`]),
}
