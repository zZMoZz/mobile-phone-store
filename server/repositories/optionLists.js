import { getDb } from '../db/connection.js';

function fail(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

// Normalize an options input to a clean JSON string of trimmed, non-empty strings.
function toOptionsJson(value) {
  const arr = Array.isArray(value) ? value : [];
  return JSON.stringify(arr.map((s) => String(s).trim()).filter(Boolean));
}

function parse(row) {
  if (!row) return undefined;
  return { ...row, options: JSON.parse(row.options || '[]') };
}

export function list() {
  return getDb().prepare('SELECT * FROM option_lists ORDER BY name_en').all().map(parse);
}

export function getById(id) {
  return parse(getDb().prepare('SELECT * FROM option_lists WHERE id = ?').get(id));
}

export function create(data) {
  const name_en = (data.name_en || '').trim();
  const name_ar = (data.name_ar || '').trim();
  if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'optlist_name_required');
  const info = getDb()
    .prepare('INSERT INTO option_lists (name_en, name_ar, options) VALUES (?, ?, ?)')
    .run(name_en, name_ar, toOptionsJson(data.options));
  return getById(info.lastInsertRowid);
}

export function update(id, data) {
  const existing = getById(id);
  if (!existing) return undefined;
  const name_en = (data.name_en ?? existing.name_en).trim();
  const name_ar = (data.name_ar ?? existing.name_ar).trim();
  if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'optlist_name_required');
  const options = data.options != null ? toOptionsJson(data.options) : JSON.stringify(existing.options);
  getDb()
    .prepare('UPDATE option_lists SET name_en = ?, name_ar = ?, options = ? WHERE id = ?')
    .run(name_en, name_ar, options, id);
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM option_lists WHERE id = ?').run(id).changes > 0;
}
