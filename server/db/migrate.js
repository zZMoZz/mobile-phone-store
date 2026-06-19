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
}

// Allow running directly: `node server/db/migrate.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate();
  console.log('Database schema applied.');
}
