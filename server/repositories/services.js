import { getDb } from '../db/connection.js';

const FIELD_TYPES = ['text', 'number', 'select'];

function fail(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

// Validates + normalizes a service's custom field schema. Throws 400 on problems.
function normalizeFields(fields) {
  if (fields == null) return [];
  if (!Array.isArray(fields)) fail(400, 'fields must be an array', 'service_fields_invalid');
  const seen = new Set();
  const seenLabelEn = new Set();
  const seenLabelAr = new Set();
  return fields.map((f) => {
    const key = (f.key || '').trim();
    if (!key) fail(400, 'Each field needs a key', 'service_field_key_required');
    if (seen.has(key)) fail(400, `Duplicate field key: ${key}`, 'service_field_key_dup');
    seen.add(key);
    const label_en = (f.label_en || '').trim();
    const label_ar = (f.label_ar || '').trim();
    if (!label_en || !label_ar) fail(400, 'Each field needs English and Arabic labels', 'service_field_label_required');
    if (seenLabelEn.has(label_en.toLowerCase())) fail(400, `Duplicate field label: ${label_en}`, 'service_field_label_en_dup');
    if (seenLabelAr.has(label_ar)) fail(400, `Duplicate field label: ${label_ar}`, 'service_field_label_ar_dup');
    seenLabelEn.add(label_en.toLowerCase());
    seenLabelAr.add(label_ar);
    if (!FIELD_TYPES.includes(f.type)) fail(400, `Invalid field type: ${f.type}`, 'service_field_type_invalid');
    const out = { key, label_en, label_ar, type: f.type, required: !!f.required };
    if (f.type === 'select') {
      if (f.option_list_id != null) {
        out.option_list_id = Number(f.option_list_id);
      } else {
        out.options = Array.isArray(f.options)
          ? f.options
              .map((o) =>
                typeof o === 'string'
                  ? { name_en: o.trim(), name_ar: o.trim() }
                  : { name_en: String(o.name_en || '').trim(), name_ar: String(o.name_ar || '').trim() }
              )
              .filter((o) => o.name_en || o.name_ar)
          : [];
      }
      if (out.option_list_id == null && (!out.options || out.options.length === 0)) {
        fail(400, 'A select field needs an option list or inline options', 'service_field_options_required');
      }
    }
    return out;
  });
}

function parse(row) {
  if (!row) return undefined;
  return { ...row, fields: JSON.parse(row.fields || '[]') };
}

export function list() {
  return getDb().prepare('SELECT * FROM services ORDER BY sort_order, name_en').all().map(parse);
}

export function getById(id) {
  return parse(getDb().prepare('SELECT * FROM services WHERE id = ?').get(id));
}

export function create(data) {
  const db = getDb();
  const name_en = (data.name_en || '').trim();
  const name_ar = (data.name_ar || '').trim();
  if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'service_name_required');
  if (db.prepare('SELECT 1 FROM services WHERE LOWER(name_en) = LOWER(?)').get(name_en))
    fail(400, 'A service with this English name already exists', 'service_name_en_taken');
  if (db.prepare('SELECT 1 FROM services WHERE LOWER(name_ar) = LOWER(?)').get(name_ar))
    fail(400, 'A service with this Arabic name already exists', 'service_name_ar_taken');
  const fields = JSON.stringify(normalizeFields(data.fields));
  const direction = data.direction === 'out' ? 'out' : 'in';
  const info = db
    .prepare('INSERT INTO services (name_en, name_ar, fields, sort_order, direction) VALUES (?, ?, ?, ?, ?)')
    .run(name_en, name_ar, fields, Number(data.sort_order) || 0, direction);
  return getById(info.lastInsertRowid);
}

export function update(id, data) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return undefined;
  const name_en = (data.name_en ?? existing.name_en).trim();
  const name_ar = (data.name_ar ?? existing.name_ar).trim();
  if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'service_name_required');
  if (db.prepare('SELECT 1 FROM services WHERE LOWER(name_en) = LOWER(?) AND id != ?').get(name_en, id))
    fail(400, 'A service with this English name already exists', 'service_name_en_taken');
  if (db.prepare('SELECT 1 FROM services WHERE LOWER(name_ar) = LOWER(?) AND id != ?').get(name_ar, id))
    fail(400, 'A service with this Arabic name already exists', 'service_name_ar_taken');
  const fields = data.fields != null ? JSON.stringify(normalizeFields(data.fields)) : JSON.stringify(existing.fields);
  const sort_order = data.sort_order != null ? Number(data.sort_order) : existing.sort_order;
  const direction = data.direction === 'out' ? 'out' : data.direction === 'in' ? 'in' : existing.direction ?? 'in';
  getDb()
    .prepare('UPDATE services SET name_en = ?, name_ar = ?, fields = ?, sort_order = ?, direction = ? WHERE id = ?')
    .run(name_en, name_ar, fields, sort_order, direction, id);
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM services WHERE id = ?').run(id).changes > 0;
}
