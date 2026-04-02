
## DB Foundation (server/db.ts) - completed 2026-04-02

### Patterns confirmed in this codebase
- All CREATE TABLE uses `CREATE TABLE IF NOT EXISTS` inside `db.run()` template literals
- Idempotent column additions use: `try { db.run("ALTER TABLE ... ADD COLUMN ...") } catch { void 0 }`
- Indexes: `db.run("CREATE INDEX IF NOT EXISTS idx_name ON table(col)")` — DESC order supported
- Helper objects use inline `db.prepare<RowType, ParamsType>(sql).all/get()` (not pre-compiled stmts)
- `randomUUID()` from `node:crypto` for all IDs
- `upsert` pattern: `INSERT ... ON CONFLICT(...) DO UPDATE SET ...`

### Breaking-change prevention
- When adding a required field to a shared interface (`EmailRow.source`), update any upsert
  method that uses `Omit<EmailRow, ...>` to also omit the new field and add `field?: type` so
  existing callers (email-service.ts) don't break. Default the new field to its column default.

### Pre-existing TypeScript errors (NOT caused by db.ts changes)
- server/email-routes.ts, server/email-service.ts, server/routes.ts, src/App.tsx, src/pages/Emails.tsx
- `bun run build` (vite) passes cleanly — only server-side tsc errors remain pre-existing
