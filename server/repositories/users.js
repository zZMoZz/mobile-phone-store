import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection.js';

function makeError(status, code) {
  const e = new Error(code);
  e.status = status;
  e.code = code;
  return e;
}

const SAFE_COLS =
  'id, username, display_name, role, status, force_password_change, token_version, permissions, created_at';

/** Parse the JSON `permissions` column into a real array on a user row. */
function hydrate(row) {
  if (!row) return row;
  let permissions = [];
  try { permissions = JSON.parse(row.permissions || '[]'); } catch { permissions = []; }
  return { ...row, permissions: Array.isArray(permissions) ? permissions : [] };
}

export function getById(id) {
  return hydrate(getDb().prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(id));
}

export function getByIdFull(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function findByUsername(username) {
  return getDb()
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username);
}

export function list() {
  return getDb()
    .prepare(`SELECT ${SAFE_COLS} FROM users ORDER BY created_at ASC`)
    .all()
    .map(hydrate);
}

export function create({ username, display_name, password_hash, role, permissions = [], force_password_change = 1 }) {
  if (!username?.trim()) throw makeError(400, 'user_username_required');
  if (!['admin', 'staff'].includes(role)) throw makeError(400, 'user_role_invalid');
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
    .get(username.trim());
  if (existing) throw makeError(409, 'user_username_taken');
  const result = db
    .prepare(
      `INSERT INTO users (username, display_name, password_hash, role, permissions, force_password_change)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      username.trim(),
      display_name?.trim() || null,
      password_hash,
      role,
      JSON.stringify(Array.isArray(permissions) ? permissions : []),
      force_password_change ? 1 : 0,
    );
  return getById(result.lastInsertRowid);
}

export function updateFields(id, fields) {
  const db = getDb();
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) {
    throw makeError(404, 'user_not_found');
  }
  const ALLOWED = ['display_name', 'role', 'status', 'password_hash', 'force_password_change', 'permissions'];
  const sets = [];
  const values = [];
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(key === 'permissions' ? JSON.stringify(fields[key] ?? []) : fields[key]);
    }
  }
  if (sets.length === 0) return getById(id);
  values.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getById(id);
}

export function incrementTokenVersion(id) {
  const db = getDb();
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(id);
  return db.prepare('SELECT token_version FROM users WHERE id = ?').get(id).token_version;
}

export function generateAndStoreRecoveryCode(id) {
  const code = randomBytes(10).toString('hex');
  const hash = bcrypt.hashSync(code, 10);
  getDb().prepare('UPDATE users SET recovery_code_hash = ? WHERE id = ?').run(hash, id);
  return code;
}
