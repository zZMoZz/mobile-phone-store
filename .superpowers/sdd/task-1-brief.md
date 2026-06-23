## Task 1: DB Migration + Seed Update

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/db/migrate.js`
- Modify: `server/db/seed.js`

**Interfaces:**
- Produces: `users` table with columns `display_name TEXT`, `status TEXT DEFAULT 'ACTIVE'`, `force_password_change INTEGER DEFAULT 0`, `token_version INTEGER DEFAULT 0`, `recovery_code_hash TEXT`; role CHECK includes `'owner'`; seeded owner has `role='owner'`, `force_password_change=1`

- [ ] **Step 1: Update `server/db/schema.sql` — replace the `users` table definition**

Replace the existing `CREATE TABLE IF NOT EXISTS users` block with:

```sql
CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name          TEXT,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('owner','admin','staff')),
  status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  force_password_change INTEGER NOT NULL DEFAULT 0,
  token_version         INTEGER NOT NULL DEFAULT 0,
  recovery_code_hash    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Add migration in `server/db/migrate.js` inside `applyColumnMigrations`**

Add after the existing migrations (before the closing brace of `applyColumnMigrations`):

```js
// Users: full table recreation to add new columns and update role CHECK constraint.
// Triggered by the absence of token_version (added in the auth overhaul).
const usersCols = columns('users');
if (!usersCols.includes('token_version')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users_new (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name          TEXT,
      password_hash         TEXT NOT NULL,
      role                  TEXT NOT NULL CHECK (role IN ('owner','admin','staff')),
      status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
      force_password_change INTEGER NOT NULL DEFAULT 0,
      token_version         INTEGER NOT NULL DEFAULT 0,
      recovery_code_hash    TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    INSERT INTO users_new (id, username, display_name, password_hash, role, status,
                           force_password_change, token_version, recovery_code_hash, created_at)
    SELECT id, username, NULL, password_hash,
           CASE WHEN role IN ('owner','admin','staff') THEN role ELSE 'staff' END,
           'ACTIVE', 0, 0, NULL, created_at
    FROM users
  `);
  db.exec('DROP TABLE users');
  db.exec('ALTER TABLE users_new RENAME TO users');
  db.exec('PRAGMA foreign_keys = ON');
}
```

- [ ] **Step 3: Update `server/db/seed.js` — seed the owner instead of a plain admin**

Replace `seedAdminUser`:

```js
function seedAdminUser(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (username, display_name, password_hash, role, force_password_change)
     VALUES ('admin', 'Administrator', ?, 'owner', 1)`
  ).run(hash);
}
```

- [ ] **Step 4: Run seed to verify the migration works on a fresh DB**

```bash
npm run seed
```

Expected: no errors, completes silently.

- [ ] **Step 5: Verify table structure manually**

```bash
node -e "import('./server/db/connection.js').then(({getDb})=>{const db=getDb();console.log(db.prepare('PRAGMA table_info(users)').all())})"
```

Expected output includes columns: `display_name`, `status`, `force_password_change`, `token_version`, `recovery_code_hash`.

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.sql server/db/migrate.js server/db/seed.js
git commit -m "feat(auth): recreate users table with display_name, status, force_password_change, token_version, recovery_code_hash"
```

---

