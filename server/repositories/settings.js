import { getDb } from '../db/connection.js';

const ALLOWED = [
  'currency',
  'default_language',
  'default_theme',
  'store_name_en',
  'store_name_ar',
  'low_stock_threshold',
  'backup_interval_hours',
];

export function get() {
  const row = getDb().prepare('SELECT * FROM settings WHERE id = 1').get();
  return row || null;
}

export function update(patch) {
  const current = get();
  if (!current) return null;
  const fields = [];
  const params = {};
  for (const key of ALLOWED) {
    if (key in patch) {
      fields.push(`${key} = @${key}`);
      const isInt = key === 'low_stock_threshold' || key === 'backup_interval_hours';
      params[key] = isInt ? Number(patch[key]) || 0 : patch[key];
    }
  }
  if (fields.length) {
    getDb().prepare(`UPDATE settings SET ${fields.join(', ')} WHERE id = 1`).run(params);
  }
  return get();
}
