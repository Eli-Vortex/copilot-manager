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
    last_error TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`)

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

export interface EmailAccountRow {
  id: string
  name: string
  email: string
  password: string
  imap_host: string
  imap_port: number
  use_tls: number
  active: number
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
}

export const emailAccounts = {
  list: () => db.prepare<EmailAccountRow, []>("SELECT * FROM email_accounts ORDER BY created_at DESC").all(),
  get: (id: string) => db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id) ?? null,
  create: (data: { name: string; email: string; password: string; imap_host: string; imap_port: number; use_tls: boolean }) => {
    const id = randomUUID()
    db.run("INSERT INTO email_accounts (id, name, email, password, imap_host, imap_port, use_tls) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, data.name, data.email, data.password, data.imap_host, data.imap_port, data.use_tls ? 1 : 0])
    return db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id)!
  },
  update: (id: string, data: { name: string; email: string; password: string; imap_host: string; imap_port: number; use_tls: boolean }) => {
    db.run("UPDATE email_accounts SET name=?, email=?, password=?, imap_host=?, imap_port=?, use_tls=? WHERE id=?",
      [data.name, data.email, data.password, data.imap_host, data.imap_port, data.use_tls ? 1 : 0, id])
    return db.prepare<EmailAccountRow, [string]>("SELECT * FROM email_accounts WHERE id = ?").get(id) ?? null
  },
  delete: (id: string) => { db.run("DELETE FROM email_accounts WHERE id = ?", [id]) },
  setError: (id: string, err: string | null) => db.run("UPDATE email_accounts SET last_error = ? WHERE id = ?", [err, id]),
}

export const emailsDb = {
  list: (opts: { account_id?: string; limit?: number; offset?: number; unread_only?: boolean }) => {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.account_id) { where.push("e.account_id = ?"); params.push(opts.account_id) }
    if (opts.unread_only) { where.push("e.is_read = 0") }
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
  upsert: (row: Omit<EmailRow, "fetched_at" | "id">) => {
    db.run(`INSERT OR REPLACE INTO emails (id, account_id, message_id, subject, from_name, from_address, to_address, date, body_text, body_html, folder, uid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), row.account_id, row.message_id, row.subject, row.from_name, row.from_address, row.to_address, row.date, row.body_text, row.body_html, row.folder, row.uid ?? null])
  },
  updateBody: (id: string, text: string, html: string) => {
    db.run("UPDATE emails SET body_text = ?, body_html = ? WHERE id = ?", [text, html, id])
  },
  clearAll: () => {
    db.run("DELETE FROM emails")
  },
}
