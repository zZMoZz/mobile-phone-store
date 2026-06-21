# Task 1 Brief: Install packages + extend DB schema + seed admin

## What to do

### Step 1 — Install server packages
In the project root (`C:\Users\mohme\OneDrive\Desktop\Hotline\Projects\mobile-phone-store`), run:
```
npm install jsonwebtoken bcryptjs
```

### Step 2 — Extend `server/db/schema.sql`
Append these two tables and their indexes **at the very end** of the file (after the `settings` table):

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','staff')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user    ON activity_logs(user_id);
```

### Step 3 — Extend `server/db/seed.js`
Add a `seedAdminUser` function and call it. Read the file first to understand its structure, then add:

```js
import bcrypt from 'bcryptjs';

function seedAdminUser(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(hash);
}
```

Call `seedAdminUser(db)` at the end of the main `seed(db)` function (or at the bottom if `db` is obtained inline). The existing `seed.js` uses `getDb()` and synchronous better-sqlite3 calls — match that pattern exactly.

**Critical:** `bcrypt.hashSync` is synchronous. Do NOT make `seed()` async.

## Constraints
- ESM only (`"type": "module"` in package.json) — use `import`, not `require`
- No tests needed for this task (schema + seed changes tested by existing test suite)
- After changes, run `npm test` to confirm existing tests still pass

## Commit
Commit with message: `feat(auth): add users+activity_logs schema, seed default admin`

## Report file
Write your full report to: `.superpowers/sdd/task-1-report.md`

Return only:
- Status: DONE / BLOCKED / NEEDS_CONTEXT
- Commit hash(es)
- One-line test summary
- Any concerns
