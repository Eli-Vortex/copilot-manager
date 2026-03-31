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
