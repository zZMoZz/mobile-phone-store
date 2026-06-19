import { pathToFileURL } from 'node:url';
import { getDb } from './connection.js';
import { migrate } from './migrate.js';

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

const SERVICE_TYPES = [
  { name_en: 'Phone Repair', name_ar: 'صيانة هاتف', default_fee: 0, consumes_parts: 1 },
  { name_en: 'Bill Payment', name_ar: 'دفع فواتير', default_fee: 5, consumes_parts: 0 },
  { name_en: 'Mobile Recharge', name_ar: 'شحن رصيد', default_fee: 2, consumes_parts: 0 },
];

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
  seedTable('service_types', SERVICE_TYPES, ['name_en', 'name_ar', 'default_fee', 'consumes_parts']);

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

  // Ensure the single settings row exists.
  const hasSettings = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (!hasSettings) {
    db.prepare(
      `INSERT INTO settings (id, currency, default_language, default_theme, store_name_en, store_name_ar, low_stock_threshold)
       VALUES (1, 'EGP', 'ar', 'light', 'Silver Store', 'متجر سيلفر', 3)`,
    ).run();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
  console.log('Seed data inserted.');
}
