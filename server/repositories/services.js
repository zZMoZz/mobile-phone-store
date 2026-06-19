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
  return fields.map((f) => {
    const key = (f.key || '').trim();
    if (!key) fail(400, 'Each field needs a key', 'service_field_key_required');
    if (seen.has(key)) fail(400, `Duplicate field key: ${key}`, 'service_field_key_dup');
    seen.add(key);
    const label_en = (f.label_en || '').trim();
    const label_ar = (f.label_ar || '').trim();
    if (!label_en || !label_ar) fail(400, 'Each field needs English and Arabic labels', 'service_field_label_required');
    if (!FIELD_TYPES.includes(f.type)) fail(400, `Invalid field type: ${f.type}`, 'service_field_type_invalid');
    const out = { key, label_en, label_ar, type: f.type, required: !!f.required };
    if (f.type === 'select') {
      if (f.option_list_id != null) {
        out.option_list_id = Number(f.option_list_id);
      } else {
        out.options = Array.isArray(f.options) ? f.options.map((s) => String(s).trim()).filter(Boolean) : [];
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
  const name_en = (data.name_en || '').trim();
  const name_ar = (data.name_ar || '').trim();
  if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'service_name_required');
  const fields = JSON.stringify(normalizeFields(data.fields));
  const info = getDb()
    .prepare('INSERT INTO services (name_en, name_ar, fields, sort_order) VALUES (?, ?, ?, ?)')
    .run(name_en, name_ar, fields, Number(data.sort_order) || 0);
  return getById(info.lastInsertRowid);
}

export function update(id, data) {
  const existing = getById(id);
  if (!existing) return undefined;
  const name_en = (data.name_en ?? existing.name_en).trim();
  const name_ar = (data.name_ar ?? existing.name_ar).trim();
  if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'service_name_required');
  const fields = data.fields != null ? JSON.stringify(normalizeFields(data.fields)) : JSON.stringify(existing.fields);
  const sort_order = data.sort_order != null ? Number(data.sort_order) : existing.sort_order;
  getDb()
    .prepare('UPDATE services SET name_en = ?, name_ar = ?, fields = ?, sort_order = ? WHERE id = ?')
    .run(name_en, name_ar, fields, sort_order, id);
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM services WHERE id = ?').run(id).changes > 0;
}
