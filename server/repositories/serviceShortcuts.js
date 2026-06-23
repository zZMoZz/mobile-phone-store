import { getDb } from '../db/connection.js';

function fail(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function parse(row) {
  if (!row) return undefined;
  return { ...row, preset_values: JSON.parse(row.preset_values || '{}') };
}

export function list(serviceId = null) {
  if (serviceId != null) {
    return getDb()
      .prepare('SELECT * FROM service_shortcuts WHERE service_id = ? ORDER BY sort_order, id')
      .all(Number(serviceId))
      .map(parse);
  }
  return getDb().prepare('SELECT * FROM service_shortcuts ORDER BY sort_order, id').all().map(parse);
}

export function getById(id) {
  return parse(getDb().prepare('SELECT * FROM service_shortcuts WHERE id = ?').get(id));
}

export function create(data) {
  const db = getDb();
  const serviceId = Number(data.service_id);
  if (!db.prepare('SELECT id FROM services WHERE id = ?').get(serviceId)) {
    fail(400, 'Service not found', 'shortcut_service_missing');
  }
  const label_en = (data.label_en || '').trim();
  const label_ar = (data.label_ar || '').trim();
  if (!label_en || !label_ar) fail(400, 'Both English and Arabic labels are required', 'shortcut_label_required');
  if (db.prepare('SELECT 1 FROM service_shortcuts WHERE LOWER(label_en) = LOWER(?)').get(label_en))
    fail(400, 'A shortcut with this English label already exists', 'shortcut_label_en_taken');
  if (db.prepare('SELECT 1 FROM service_shortcuts WHERE LOWER(label_ar) = LOWER(?)').get(label_ar))
    fail(400, 'A shortcut with this Arabic label already exists', 'shortcut_label_ar_taken');
  const info = db
    .prepare(
      'INSERT INTO service_shortcuts (service_id, label_en, label_ar, color, sort_order, preset_values) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(serviceId, label_en, label_ar, data.color || null, Number(data.sort_order) || 0, JSON.stringify(data.preset_values || {}));
  return getById(info.lastInsertRowid);
}

export function update(id, data) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return undefined;
  const label_en = (data.label_en ?? existing.label_en).trim();
  const label_ar = (data.label_ar ?? existing.label_ar).trim();
  if (!label_en || !label_ar) fail(400, 'Both English and Arabic labels are required', 'shortcut_label_required');
  if (db.prepare('SELECT 1 FROM service_shortcuts WHERE LOWER(label_en) = LOWER(?) AND id != ?').get(label_en, id))
    fail(400, 'A shortcut with this English label already exists', 'shortcut_label_en_taken');
  if (db.prepare('SELECT 1 FROM service_shortcuts WHERE LOWER(label_ar) = LOWER(?) AND id != ?').get(label_ar, id))
    fail(400, 'A shortcut with this Arabic label already exists', 'shortcut_label_ar_taken');
  const preset = data.preset_values != null ? JSON.stringify(data.preset_values) : JSON.stringify(existing.preset_values);
  const color = data.color !== undefined ? data.color || null : existing.color;
  const sort_order = data.sort_order != null ? Number(data.sort_order) : existing.sort_order;
  db
    .prepare('UPDATE service_shortcuts SET label_en = ?, label_ar = ?, color = ?, sort_order = ?, preset_values = ? WHERE id = ?')
    .run(label_en, label_ar, color, sort_order, preset, id);
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM service_shortcuts WHERE id = ?').run(id).changes > 0;
}
