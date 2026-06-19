import { getDb } from '../db/connection.js';

export function list() {
  return getDb().prepare('SELECT * FROM service_types ORDER BY name_en').all();
}

export function getById(id) {
  return getDb().prepare('SELECT * FROM service_types WHERE id = ?').get(id);
}

export function create(data) {
  const name_en = (data.name_en || '').trim();
  const name_ar = (data.name_ar || '').trim();
  if (!name_en || !name_ar) {
    const err = new Error('Both English and Arabic names are required');
    err.status = 400;
    throw err;
  }
  const info = getDb()
    .prepare(
      `INSERT INTO service_types (name_en, name_ar, default_fee, consumes_parts)
       VALUES (?, ?, ?, ?)`,
    )
    .run(name_en, name_ar, Number(data.default_fee) || 0, data.consumes_parts ? 1 : 0);
  return getById(info.lastInsertRowid);
}

export function update(id, data) {
  const existing = getById(id);
  if (!existing) return undefined;
  getDb()
    .prepare(
      `UPDATE service_types SET name_en = ?, name_ar = ?, default_fee = ?, consumes_parts = ? WHERE id = ?`,
    )
    .run(
      data.name_en ?? existing.name_en,
      data.name_ar ?? existing.name_ar,
      data.default_fee != null ? Number(data.default_fee) : existing.default_fee,
      data.consumes_parts != null ? (data.consumes_parts ? 1 : 0) : existing.consumes_parts,
      id,
    );
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM service_types WHERE id = ?').run(id).changes > 0;
}
