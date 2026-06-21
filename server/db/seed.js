import { pathToFileURL } from 'node:url';
import { getDb } from './connection.js';
import { migrate } from './migrate.js';
import bcrypt from 'bcryptjs';

const CATEGORIES = [
  { name_en: 'Headphones', name_ar: 'سماعات رأس' },
  { name_en: 'Speakers', name_ar: 'مكبرات صوت' },
  { name_en: 'Accessories', name_ar: 'إكسسوارات' },
  { name_en: 'Used Phones', name_ar: 'هواتف مستعملة' },
  { name_en: 'Spare Parts', name_ar: 'أجزاء صيانة' },
  { name_en: 'Chargers & Cables', name_ar: 'شواحن وكابلات' },
];

const BRANDS = [
  { name_en: 'Samsung', name_ar: 'سامسونج' },
  { name_en: 'Apple', name_ar: 'أبل' },
  { name_en: 'Xiaomi', name_ar: 'شاومي' },
  { name_en: 'Oppo', name_ar: 'أوبو' },
  { name_en: 'Generic', name_ar: 'غير محدد' },
];

function seedAdminUser(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(hash);
}

/** Inserts default reference data. Idempotent: skips when data already exists. */
export function seed() {
  migrate();
  const db = getDb();

  const seedTable = (table, rows, columns) => {
    const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
    if (count > 0) return;
    const placeholders = columns.map((c) => `@${c}`).join(', ');
    const stmt = db.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    );
    const insertMany = db.transaction((items) => items.forEach((it) => stmt.run(it)));
    insertMany(rows);
  };

  seedTable('categories', CATEGORIES, ['name_en', 'name_ar']);
  seedTable('brands', BRANDS, ['name_en', 'name_ar']);

  // Guarantee a protected "Generic" category and brand always exist (even after a
  // reset / if the user deleted everything) so products always have a fallback that
  // can't be removed. Idempotent: promotes an existing same-named row or inserts one.
  const ensureProtected = (table, { name_en, name_ar }) => {
    if (db.prepare(`SELECT id FROM ${table} WHERE is_protected = 1`).get()) return;
    const sameName = db.prepare(`SELECT id FROM ${table} WHERE lower(name_en) = lower(?)`).get(name_en);
    if (sameName) {
      db.prepare(`UPDATE ${table} SET is_protected = 1 WHERE id = ?`).run(sameName.id);
    } else {
      db.prepare(`INSERT INTO ${table} (name_en, name_ar, is_protected) VALUES (?, ?, 1)`).run(name_en, name_ar);
    }
  };
  ensureProtected('categories', { name_en: 'Generic', name_ar: 'عام' });
  ensureProtected('brands', { name_en: 'Generic', name_ar: 'غير محدد' });

  // Services module seed (new model). Idempotent: only when there are no services yet.
  if (db.prepare('SELECT COUNT(*) AS c FROM services').get().c === 0) {
    const providers = db
      .prepare('INSERT INTO option_lists (name_en, name_ar, options) VALUES (?, ?, ?)')
      .run('Providers', 'المزودون', JSON.stringify(['Vodafone', 'WE', 'Orange', 'E&']));
    const providersId = providers.lastInsertRowid;

    const insertService = db.prepare(
      'INSERT INTO services (name_en, name_ar, fields, sort_order) VALUES (?, ?, ?, ?)',
    );
    const topupId = insertService.run(
      'Top-up',
      'شحن',
      JSON.stringify([
        { key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'select', required: true, option_list_id: providersId },
        { key: 'type', label_en: 'Type', label_ar: 'النوع', type: 'select', required: true, options: ['شحن', 'كارت فكة', 'أخرى'] },
      ]),
      1,
    ).lastInsertRowid;
    insertService.run(
      'Bill Payment',
      'دفع فواتير',
      JSON.stringify([
        { key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'select', required: false, option_list_id: providersId },
      ]),
      2,
    );
    insertService.run('Maintenance', 'صيانة', JSON.stringify([]), 3);

    const insertShortcut = db.prepare(
      'INSERT INTO service_shortcuts (service_id, label_en, label_ar, color, sort_order, preset_values) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertShortcut.run(topupId, 'Vodafone شحن', 'فودافون شحن', 'red', 1, JSON.stringify({ provider: 'Vodafone', type: 'شحن' }));
    insertShortcut.run(topupId, 'Orange شحن', 'أورنج شحن', 'orange', 2, JSON.stringify({ provider: 'Orange', type: 'شحن' }));
    insertShortcut.run(topupId, 'WE شحن', 'وي شحن', 'grape', 3, JSON.stringify({ provider: 'WE', type: 'شحن' }));
  }

  // Ensure the single settings row exists.
  const hasSettings = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (!hasSettings) {
    db.prepare(
      `INSERT INTO settings (id, currency, default_language, default_theme, store_name_en, store_name_ar, low_stock_threshold)
       VALUES (1, 'EGP', 'ar', 'light', 'Silver Store', 'متجر سيلفر', 3)`,
    ).run();
  }

  seedAdminUser(db);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
  console.log('Seed data inserted.');
}
