import { getDb } from '../db/connection.js';

function fail(status, message, code, params) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (params) err.params = params;
  throw err;
}

// Normalize an options input to a clean JSON string of bilingual option objects.
function toOptionsJson(value) {
  const arr = Array.isArray(value) ? value : [];
  const items = arr
    .map((o) => {
      if (typeof o === 'string') return { name_en: o.trim(), name_ar: o.trim() };
      return { name_en: String(o.name_en || '').trim(), name_ar: String(o.name_ar || '').trim() };
    })
    .filter((o) => o.name_en || o.name_ar);

  const seenEn = new Set();
  const seenAr = new Set();
  for (const o of items) {
    if (o.name_en && seenEn.has(o.name_en.toLowerCase()))
      fail(400, `Duplicate English option: ${o.name_en}`, 'optlist_option_dup_en');
    if (o.name_ar && seenAr.has(o.name_ar))
      fail(400, `Duplicate Arabic option: ${o.name_ar}`, 'optlist_option_dup_ar');
    if (o.name_en) seenEn.add(o.name_en.toLowerCase());
    if (o.name_ar) seenAr.add(o.name_ar);
  }

  return JSON.stringify(items);
}

function checkNameUnique(name_en, name_ar, excludeId = null) {
  const db = getDb();
  const enRow = excludeId != null
    ? db.prepare('SELECT id FROM option_lists WHERE LOWER(name_en) = LOWER(?) AND id != ?').get(name_en, excludeId)
    : db.prepare('SELECT id FROM option_lists WHERE LOWER(name_en) = LOWER(?)').get(name_en);
  if (enRow) fail(400, 'English name already used', 'optlist_name_en_duplicate');

  const arRow = excludeId != null
    ? db.prepare('SELECT id FROM option_lists WHERE LOWER(name_ar) = LOWER(?) AND id != ?').get(name_ar, excludeId)
    : db.prepare('SELECT id FROM option_lists WHERE LOWER(name_ar) = LOWER(?)').get(name_ar);
  if (arRow) fail(400, 'Arabic name already used', 'optlist_name_ar_duplicate');
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
  checkNameUnique(name_en, name_ar);
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
  checkNameUnique(name_en, name_ar, id);
  const options = data.options != null ? toOptionsJson(data.options) : JSON.stringify(existing.options);
  getDb()
    .prepare('UPDATE option_lists SET name_en = ?, name_ar = ?, options = ? WHERE id = ?')
    .run(name_en, name_ar, options, id);
  return getById(id);
}

export function remove(id) {
  const db = getDb();
  const usedByServices = db.prepare('SELECT id, name_en, name_ar, fields FROM services').all().filter(({ fields }) => {
    const parsed = JSON.parse(fields || '[]');
    return parsed.some((f) => f.option_list_id === id);
  });
  if (usedByServices.length > 0) {
    fail(409, `Used by ${usedByServices.length} service(s)`, 'optlist_in_use', {
      n: usedByServices.length,
      services: usedByServices.map((s) => ({ name_en: s.name_en, name_ar: s.name_ar })),
    });
  }
  return db.prepare('DELETE FROM option_lists WHERE id = ?').run(id).changes > 0;
}
