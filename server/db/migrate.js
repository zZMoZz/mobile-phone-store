import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getDb } from './connection.js';
import { SCHEMA_PATH } from './paths.js';

/** Applies schema.sql to the database. Idempotent. */
export function migrate() {
  const db = getDb();
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);
  applyColumnMigrations(db);
  return db;
}

/**
 * In-place column additions for databases created before a column existed.
 * schema.sql only runs `CREATE TABLE IF NOT EXISTS`, so existing tables never
 * gain new columns from it — we add them here. Idempotent.
 */
function applyColumnMigrations(db) {
  const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

  // Settings: single `store_name` → bilingual `store_name_en` / `store_name_ar`.
  const settingsCols = columns('settings');
  if (!settingsCols.includes('store_name_en')) {
    db.exec("ALTER TABLE settings ADD COLUMN store_name_en TEXT NOT NULL DEFAULT 'My Store'");
    // Carry over a previously customized single name into the English field.
    if (settingsCols.includes('store_name')) {
      db.exec("UPDATE settings SET store_name_en = store_name WHERE store_name IS NOT NULL AND trim(store_name) != ''");
    }
  }
  if (!settingsCols.includes('store_name_ar')) {
    db.exec("ALTER TABLE settings ADD COLUMN store_name_ar TEXT NOT NULL DEFAULT 'متجري'");
  }
  // Settings: optional external backup folder (e.g. a Google-Drive-synced path).
  if (!settingsCols.includes('backup_dir')) {
    db.exec("ALTER TABLE settings ADD COLUMN backup_dir TEXT NOT NULL DEFAULT ''");
  }

  // Categories/brands: protected default flag (e.g. the always-present "Generic").
  for (const table of ['categories', 'brands']) {
    if (!columns(table).includes('is_protected')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // Transactions: service redesign columns.
  const txnCols = columns('transactions');
  if (!txnCols.includes('service_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE SET NULL');
  }
  if (!txnCols.includes('service_data')) {
    db.exec('ALTER TABLE transactions ADD COLUMN service_data TEXT');
  }

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

  // Migrate option_lists.options from string[] to {name_en, name_ar}[].
  db.prepare('SELECT id, options FROM option_lists').all().forEach(({ id, options }) => {
    const parsed = JSON.parse(options || '[]');
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated = parsed.map((s) => ({ name_en: s, name_ar: s }));
      db.prepare('UPDATE option_lists SET options = ? WHERE id = ?').run(JSON.stringify(migrated), id);
    }
  });

  // Migrate services.fields inline options from string[] to {name_en, name_ar}[].
  db.prepare('SELECT id, fields FROM services').all().forEach(({ id, fields }) => {
    const parsed = JSON.parse(fields || '[]');
    let changed = false;
    const updated = parsed.map((f) => {
      if (f.type !== 'select' || !Array.isArray(f.options) || f.options.length === 0) return f;
      if (typeof f.options[0] !== 'string') return f;
      changed = true;
      return { ...f, options: f.options.map((s) => ({ name_en: s, name_ar: s })) };
    });
    if (changed) db.prepare('UPDATE services SET fields = ? WHERE id = ?').run(JSON.stringify(updated), id);
  });

  // Ensure at least one owner exists. Pre-auth-overhaul DBs had all users as
  // 'admin'; the recreation above preserves that role, leaving no owner.
  // Promote the oldest admin to owner so the permission matrix works correctly.
  const ownerCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get().c;
  if (ownerCount === 0) {
    const oldest = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
    if (oldest) db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(oldest.id);
  }
}

// Allow running directly: `node server/db/migrate.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate();
  console.log('Database schema applied.');
}
