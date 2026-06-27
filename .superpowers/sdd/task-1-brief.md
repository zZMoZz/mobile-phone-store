## Task 1: DB Schema + Migration

**Files:**
- Modify: `server/db/schema.sql:73-88`
- Modify: `server/db/migrate.js:49-58` (inside the `applyColumnMigrations` function, in the `// Transactions: service redesign columns.` block)

- [ ] **Step 1: Add columns to schema.sql**

In `server/db/schema.sql`, find the `CREATE TABLE IF NOT EXISTS transactions` block (line 73). Add the two new columns **before** the closing `);`:

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL CHECK (type IN ('purchase','sale','service','return','expense')),
  service_type_id INTEGER REFERENCES service_types(id) ON DELETE SET NULL,
  service_id      INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_data    TEXT,                        -- JSON snapshot for service transactions
  note            TEXT,
  subtotal        REAL NOT NULL DEFAULT 0,     -- sum of item line totals
  fee             REAL NOT NULL DEFAULT 0,     -- service fee (service transactions)
  cost_total      REAL NOT NULL DEFAULT 0,     -- total cost of goods involved
  total           REAL NOT NULL DEFAULT 0,     -- amount charged/paid
  profit          REAL NOT NULL DEFAULT 0,     -- total - cost_total (sale/service)
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username_snapshot TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at       TEXT DEFAULT NULL,
  voided_by_id    INTEGER REFERENCES users(id) DEFAULT NULL
);
```

- [ ] **Step 2: Add migration for existing DBs in migrate.js**

In `server/db/migrate.js`, inside `applyColumnMigrations(db)`, **after** the existing `txnCols` block (the block ending around line 58 that adds `username_snapshot`), add:

```js
  if (!txnCols.includes('voided_at')) {
    db.exec('ALTER TABLE transactions ADD COLUMN voided_at TEXT DEFAULT NULL');
  }
  if (!txnCols.includes('voided_by_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN voided_by_id INTEGER REFERENCES users(id) DEFAULT NULL');
  }
```

Note: `txnCols` is already defined earlier in the same block as `columns('transactions')` — no re-declaration needed.

- [ ] **Step 3: Verify migration runs without error**

```bash
npm run seed
```

Expected: exits without error. The DB now has the two new columns.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.sql server/db/migrate.js
git commit -m "feat(void): add voided_at and voided_by_id columns to transactions"
```

---

