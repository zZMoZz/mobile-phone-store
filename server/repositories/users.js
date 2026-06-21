import { getDb } from '../db/connection.js';

function makeError(status, code) {
  const e = new Error(code);
  e.status = status;
  e.code = code;
  return e;
}

export function findByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

export function getById(id) {
  return getDb().prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
}

export function list() {
  return getDb().prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
}

export function create({ username, password_hash, role }) {
  if (!username?.trim()) throw makeError(400, 'user_username_required');
  if (!['admin', 'staff'].includes(role)) throw makeError(400, 'user_role_invalid');
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  if (existing) throw makeError(409, 'user_username_taken');
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username.trim(), password_hash, role);
  return getById(result.lastInsertRowid);
}

export function update(id, { username, role, password_hash }) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw makeError(404, 'user_not_found');

  if (username !== undefined) {
    const trimmed = username.trim();
    if (!trimmed) throw makeError(400, 'user_username_required');
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(trimmed, id);
    if (conflict) throw makeError(409, 'user_username_taken');
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(trimmed, id);
  }
  if (role !== undefined) {
    if (!['admin', 'staff'].includes(role)) throw makeError(400, 'user_role_invalid');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  }
  if (password_hash !== undefined) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, id);
  }
  return getById(id);
}

export function remove(id) {
  const db = getDb();
  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(id);
  if (!target) throw makeError(404, 'user_not_found');
  if (target.role === 'admin' && adminCount <= 1) throw makeError(409, 'user_last_admin');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return true;
}
