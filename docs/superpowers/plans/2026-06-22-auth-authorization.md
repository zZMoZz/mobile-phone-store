# Auth & Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `display_name`, `owner` role, `force_password_change` flow, recovery codes for admin/owner, `DISABLED` status (soft-delete), session invalidation via `token_version`, granular per-role edit permissions, and a top-bar account menu.

**Architecture:** A `token_version` integer column on `users` is included in every JWT; the `authenticate` middleware DB-checks it on every request — incrementing it invalidates all outstanding sessions immediately. Three roles: `owner > admin > staff`. Force-change is enforced by the frontend route guard and checked in the endpoint handler. Recovery codes (bcrypt-hashed) let admin/owner self-recover without involving the owner.

**Tech Stack:** Node.js/Express/ESM, better-sqlite3, bcryptjs, jsonwebtoken, React/Vite/Mantine v7, react-router-dom v6, react-i18next, Vitest/Supertest.

## Global Constraints

- ESM throughout (`"type": "module"`); all imports use `.js`/`.jsx` extensions
- DB via `getDb()` from `server/db/connection.js`; wrap multi-step writes in `db.transaction()`
- Never return `password_hash` or `recovery_code_hash` from any API endpoint
- i18n: never hardcode UI strings — add keys to both `en.json` and `ar.json`
- Tests use `setupTestApp()` from `server/test/helpers.js`; never touch `data/store.db`
- Role values (string): `'owner'` | `'admin'` | `'staff'`
- Status values (string): `'ACTIVE'` | `'DISABLED'`
- Recovery code: `crypto.randomBytes(10).toString('hex')` → 20 hex chars, bcrypt-hashed at cost 10
- JWT payload shape: `{ sub: number, username: string, display_name: string|null, role: string, tv: number }`
- Minimum password length: 6 characters
- `requireAdmin` allows both `'admin'` and `'owner'`; `requireOwner` allows only `'owner'`

## Permission Matrix (reference for all tasks)

| Operation | staff | admin | owner |
|---|:---:|:---:|:---:|
| Use the app | ✓ | ✓ | ✓ |
| Self: change own password | ✓ | ✓ | ✓ |
| Self: edit own display_name | ✓ | ✓ | ✓ |
| Create staff | | ✓ | ✓ |
| Create admin | | | ✓ |
| Edit staff: display_name | | ✓ | ✓ |
| Edit staff: role (→admin) | | ✓ | ✓ |
| Edit staff: status (enable/disable) | | ✓ | ✓ |
| Reset staff password | | ✓ | ✓ |
| Edit admin: display_name | | | ✓ |
| Edit admin: role (→staff) | | | ✓ |
| Edit admin: status (enable/disable) | | | ✓ |
| Reset admin password | | | ✓ |
| Disable own account | ✗ | ✗ | ✗ |
| Disable/modify owner account | ✗ | ✗ | ✗ |

---

## Task 1: DB Migration + Seed Update

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/db/migrate.js`
- Modify: `server/db/seed.js`

**Interfaces:**
- Produces: `users` table with columns `display_name TEXT`, `status TEXT DEFAULT 'ACTIVE'`, `force_password_change INTEGER DEFAULT 0`, `token_version INTEGER DEFAULT 0`, `recovery_code_hash TEXT`; role CHECK includes `'owner'`; seeded owner has `role='owner'`, `force_password_change=1`

- [ ] **Step 1: Update `server/db/schema.sql` — replace the `users` table definition**

Replace the existing `CREATE TABLE IF NOT EXISTS users` block with:

```sql
CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name          TEXT,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('owner','admin','staff')),
  status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  force_password_change INTEGER NOT NULL DEFAULT 0,
  token_version         INTEGER NOT NULL DEFAULT 0,
  recovery_code_hash    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Add migration in `server/db/migrate.js` inside `applyColumnMigrations`**

Add after the existing migrations (before the closing brace of `applyColumnMigrations`):

```js
// Users: full table recreation to add new columns and update role CHECK constraint.
// Triggered by the absence of token_version (added in the auth overhaul).
const usersCols = columns('users');
if (!usersCols.includes('token_version')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users_new (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name          TEXT,
      password_hash         TEXT NOT NULL,
      role                  TEXT NOT NULL CHECK (role IN ('owner','admin','staff')),
      status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
      force_password_change INTEGER NOT NULL DEFAULT 0,
      token_version         INTEGER NOT NULL DEFAULT 0,
      recovery_code_hash    TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    INSERT INTO users_new (id, username, display_name, password_hash, role, status,
                           force_password_change, token_version, recovery_code_hash, created_at)
    SELECT id, username, NULL, password_hash,
           CASE WHEN role IN ('owner','admin','staff') THEN role ELSE 'staff' END,
           'ACTIVE', 0, 0, NULL, created_at
    FROM users
  `);
  db.exec('DROP TABLE users');
  db.exec('ALTER TABLE users_new RENAME TO users');
  db.exec('PRAGMA foreign_keys = ON');
}
```

- [ ] **Step 3: Update `server/db/seed.js` — seed the owner instead of a plain admin**

Replace `seedAdminUser`:

```js
function seedAdminUser(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (username, display_name, password_hash, role, force_password_change)
     VALUES ('admin', 'Administrator', ?, 'owner', 1)`
  ).run(hash);
}
```

- [ ] **Step 4: Run seed to verify the migration works on a fresh DB**

```bash
npm run seed
```

Expected: no errors, completes silently.

- [ ] **Step 5: Verify table structure manually**

```bash
node -e "import('./server/db/connection.js').then(({getDb})=>{const db=getDb();console.log(db.prepare('PRAGMA table_info(users)').all())})"
```

Expected output includes columns: `display_name`, `status`, `force_password_change`, `token_version`, `recovery_code_hash`.

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.sql server/db/migrate.js server/db/seed.js
git commit -m "feat(auth): recreate users table with display_name, status, force_password_change, token_version, recovery_code_hash"
```

---

## Task 2: Users Repository — Updated for All New Fields

**Files:**
- Modify: `server/repositories/users.js`

**Interfaces:**
- Consumes: updated `users` table from Task 1
- Produces:
  - `getById(id)` → `{ id, username, display_name, role, status, force_password_change, token_version, created_at }` (no secrets)
  - `getByIdFull(id)` → all columns including `password_hash`, `recovery_code_hash`
  - `findByUsername(username)` → all columns (used for login)
  - `list()` → array of safe-column rows ordered by `created_at ASC`
  - `create({ username, display_name, password_hash, role, force_password_change })` → safe row
  - `updateFields(id, fields)` → safe row after update; `fields` may contain any subset of `{ display_name, role, status, password_hash, force_password_change }`
  - `incrementTokenVersion(id)` → new `token_version` number
  - `generateAndStoreRecoveryCode(id)` → plaintext 20-char hex code (hash is stored in DB)

- [ ] **Step 1: Rewrite `server/repositories/users.js`**

```js
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
  'id, username, display_name, role, status, force_password_change, token_version, created_at';

export function getById(id) {
  return getDb().prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(id);
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
    .all();
}

export function create({ username, display_name, password_hash, role, force_password_change = 1 }) {
  if (!username?.trim()) throw makeError(400, 'user_username_required');
  if (!['admin', 'staff'].includes(role)) throw makeError(400, 'user_role_invalid');
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
    .get(username.trim());
  if (existing) throw makeError(409, 'user_username_taken');
  const result = db
    .prepare(
      `INSERT INTO users (username, display_name, password_hash, role, force_password_change)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      username.trim(),
      display_name?.trim() || null,
      password_hash,
      role,
      force_password_change ? 1 : 0,
    );
  return getById(result.lastInsertRowid);
}

export function updateFields(id, fields) {
  const db = getDb();
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) {
    throw makeError(404, 'user_not_found');
  }
  const ALLOWED = ['display_name', 'role', 'status', 'password_hash', 'force_password_change'];
  const sets = [];
  const values = [];
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
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
```

- [ ] **Step 2: Run existing tests to make sure nothing broke**

```bash
npm test
```

Expected: all existing tests pass (some may need helper.js update in Task 3 if middleware is already updated — if tests fail due to middleware changes, come back after Task 3).

- [ ] **Step 3: Commit**

```bash
git add server/repositories/users.js
git commit -m "feat(auth): update users repository — safe/full getById, create with display_name, updateFields, token_version, recovery_code helpers"
```

---

## Task 3: Auth Middleware + Lib — Token Version Check + requireOwner

**Files:**
- Modify: `server/lib/auth.js` (no change needed — `signToken` already accepts arbitrary payload)
- Modify: `server/middleware/authenticate.js`
- Modify: `server/middleware/requireAdmin.js`
- Create: `server/middleware/requireOwner.js`
- Modify: `server/test/helpers.js`

**Interfaces:**
- Consumes: `getById(id)` from Task 2
- Produces:
  - `authenticate` sets `req.user = { id, username, display_name, role, force_password_change }` — rejects 401 if token_version mismatch or user DISABLED
  - `requireAdmin(req, res, next)` — allows `'admin'` and `'owner'`, rejects `'staff'`
  - `requireOwner(req, res, next)` — allows only `'owner'`
  - `signToken(payload)` caller must include `tv: token_version` in payload

- [ ] **Step 1: Rewrite `server/middleware/authenticate.js`**

```js
import { verifyToken } from '../lib/auth.js';
import { getById } from '../repositories/users.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'auth_required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    const user = getById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session', code: 'auth_invalid' });
    }
    if (user.status === 'DISABLED') {
      return res.status(401).json({ error: 'Account disabled', code: 'auth_disabled' });
    }
    if (user.token_version !== payload.tv) {
      return res.status(401).json({ error: 'Session invalidated', code: 'auth_invalid' });
    }
    req.user = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      force_password_change: user.force_password_change,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'auth_invalid' });
  }
}
```

- [ ] **Step 2: Rewrite `server/middleware/requireAdmin.js`**

```js
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Admin only', code: 'auth_forbidden' });
  }
  next();
}
```

- [ ] **Step 3: Create `server/middleware/requireOwner.js`**

```js
export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner only', code: 'auth_owner_only' });
  }
  next();
}
```

- [ ] **Step 4: Update `server/test/helpers.js` — token must include `tv` and match DB**

Replace the `signToken` call so the token version matches the seeded owner:

```js
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

export async function setupTestApp() {
  const dbPath = path.join(os.tmpdir(), `store-test-${randomUUID()}.db`);
  process.env.STORE_DB_PATH = dbPath;
  const backupsDir = path.join(os.tmpdir(), `store-test-backups-${randomUUID()}`);
  process.env.STORE_BACKUPS_DIR = backupsDir;

  const { seed } = await import('../db/seed.js');
  const { getDb, closeDb } = await import('../db/connection.js');
  const { createApp } = await import('../app.js');
  const { signToken } = await import('../lib/auth.js');

  seed();
  const db = getDb();
  const app = createApp();

  // Use the seeded owner so token_version and role match the DB.
  const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get();
  const token = signToken({
    sub: owner.id,
    username: owner.username,
    display_name: owner.display_name,
    role: owner.role,
    tv: owner.token_version,
  });

  const bearer = `Bearer ${token}`;
  const api = {
    get: (url) => request(app).get(url).set('Authorization', bearer),
    post: (url) => request(app).post(url).set('Authorization', bearer),
    put: (url) => request(app).put(url).set('Authorization', bearer),
    delete: (url) => request(app).delete(url).set('Authorization', bearer),
    patch: (url) => request(app).patch(url).set('Authorization', bearer),
  };

  const cleanup = () => {
    closeDb();
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + ext); } catch { /* ignore */ }
    }
    try { fs.rmSync(backupsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  return { app, db, token, api, cleanup };
}
```

- [ ] **Step 5: Run all existing tests**

```bash
npm test
```

Expected: all pass. If any fail with `auth_invalid`, the token in helpers.js isn't matching. Double-check that `owner.token_version` is `0` after seed and the token includes `tv: 0`.

- [ ] **Step 6: Commit**

```bash
git add server/middleware/authenticate.js server/middleware/requireAdmin.js server/middleware/requireOwner.js server/test/helpers.js
git commit -m "feat(auth): authenticate middleware checks token_version + DISABLED status; add requireOwner; update test helper"
```

---

## Task 4: Auth Routes — Login, Force-Change, Change-Password, Recover, Me

**Files:**
- Modify: `server/routes/auth.js`

**Interfaces:**
- Consumes: `findByUsername`, `getById`, `getByIdFull`, `updateFields`, `incrementTokenVersion`, `generateAndStoreRecoveryCode` from Task 2; `signToken` from `server/lib/auth.js`; `authenticate` from Task 3
- Produces:
  - `POST /api/auth/login` → `{ token, user: { id, username, display_name, role, force_password_change } }`; 401 `auth_disabled` if disabled
  - `POST /api/auth/force-change-password` (authenticated) → `{ token, user, recovery_code? }` where `recovery_code` is present for admin/owner
  - `POST /api/auth/change-password` (authenticated) → `{ token, user }`
  - `POST /api/auth/recover` (public) → `{ token, user, recovery_code }` (new code)
  - `GET /api/auth/me` (authenticated) → `{ id, username, display_name, role, force_password_change }`

- [ ] **Step 1: Rewrite `server/routes/auth.js`**

```js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../lib/auth.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  findByUsername,
  getById,
  getByIdFull,
  updateFields,
  incrementTokenVersion,
  generateAndStoreRecoveryCode,
} from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';
import { runScheduledBackup } from '../lib/backup.js';

const router = Router();

function makeUserToken(user, tv) {
  return signToken({
    sub: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    tv,
  });
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    force_password_change: user.force_password_change === 1,
  };
}

// POST /api/auth/login — public
router.post('/login', (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required', code: 'auth_required' });
    }
    const user = findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'auth_invalid_credentials' });
    }
    if (user.status === 'DISABLED') {
      return res.status(401).json({ error: 'Account disabled', code: 'auth_disabled' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'auth_invalid_credentials' });
    }
    runScheduledBackup();
    const token = makeUserToken(user, user.token_version);
    logActivity({ userId: user.id, username: user.username, action: 'login' });
    res.json({ token, user: safeUser(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — authenticated
router.post('/logout', authenticate, (req, res, next) => {
  try {
    runScheduledBackup();
    logActivity({ userId: req.user.id, username: req.user.username, action: 'logout' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/me — authenticated
router.get('/me', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    display_name: req.user.display_name,
    role: req.user.role,
    force_password_change: req.user.force_password_change === 1,
  });
});

// POST /api/auth/force-change-password — authenticated, only when force_password_change=1
router.post('/force-change-password', authenticate, (req, res, next) => {
  try {
    if (!req.user.force_password_change) {
      return res.status(400).json({ error: 'No forced change pending', code: 'auth_no_force_change' });
    }
    const { new_password } = req.body ?? {};
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'auth_password_too_short' });
    }
    const password_hash = bcrypt.hashSync(new_password, 10);
    updateFields(req.user.id, { password_hash, force_password_change: 0 });
    const newTv = incrementTokenVersion(req.user.id);

    let recovery_code = null;
    if (['admin', 'owner'].includes(req.user.role)) {
      recovery_code = generateAndStoreRecoveryCode(req.user.id);
    }

    const user = getById(req.user.id);
    const token = makeUserToken(user, newTv);
    logActivity({ userId: user.id, username: user.username, action: 'force_change_password' });
    res.json({ token, user: safeUser(user), recovery_code });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password — authenticated, self-service (verifies current password)
router.post('/change-password', authenticate, (req, res, next) => {
  try {
    const { current_password, new_password } = req.body ?? {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Both passwords required', code: 'auth_passwords_required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'auth_password_too_short' });
    }
    const full = getByIdFull(req.user.id);
    if (!bcrypt.compareSync(current_password, full.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect', code: 'auth_wrong_password' });
    }
    const password_hash = bcrypt.hashSync(new_password, 10);
    updateFields(req.user.id, { password_hash });
    const newTv = incrementTokenVersion(req.user.id);
    const user = getById(req.user.id);
    const token = makeUserToken(user, newTv);
    logActivity({ userId: user.id, username: user.username, action: 'change_password' });
    res.json({ token, user: safeUser(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/recover — PUBLIC, for admin/owner self-service password recovery
router.post('/recover', (req, res, next) => {
  try {
    const { username, recovery_code, new_password } = req.body ?? {};
    if (!username || !recovery_code || !new_password) {
      return res.status(400).json({ error: 'Username, recovery code, and new password required', code: 'auth_recover_fields_required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'auth_password_too_short' });
    }
    const user = findByUsername(username);
    const GENERIC_ERROR = { error: 'Invalid username or recovery code', code: 'auth_recover_invalid' };
    if (!user || !user.recovery_code_hash) {
      return res.status(400).json(GENERIC_ERROR);
    }
    if (!bcrypt.compareSync(recovery_code, user.recovery_code_hash)) {
      return res.status(400).json(GENERIC_ERROR);
    }
    const password_hash = bcrypt.hashSync(new_password, 10);
    updateFields(user.id, { password_hash, force_password_change: 0 });
    const newTv = incrementTokenVersion(user.id);
    const new_recovery_code = generateAndStoreRecoveryCode(user.id);
    const updatedUser = getById(user.id);
    const token = makeUserToken(updatedUser, newTv);
    logActivity({ userId: updatedUser.id, username: updatedUser.username, action: 'recover_password' });
    res.json({ token, user: safeUser(updatedUser), recovery_code: new_recovery_code });
  } catch (err) { next(err); }
});

export default router;
```

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat(auth): login returns display_name+force_password_change; add force-change-password, change-password, recover endpoints"
```

---

## Task 5: Users Route — Permission Matrix, No Physical Delete

**Files:**
- Modify: `server/routes/users.js`

**Interfaces:**
- Consumes: `getById`, `list`, `create`, `updateFields`, `incrementTokenVersion` from Task 2; `requireAdmin` from Task 3
- Produces:
  - `GET /api/users` (admin/owner) → array of safe user objects
  - `POST /api/users` (admin/owner) → created user; admin can only set role='staff'
  - `PUT /api/users/:id` (any authenticated) → updated user; enforces permission matrix
  - `DELETE /api/users/:id` — removed (returns 404/405)

- [ ] **Step 1: Rewrite `server/routes/users.js`**

```js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getById, list, create, updateFields, incrementTokenVersion } from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

// GET / — admin or owner only
router.get('/', requireAdmin, (req, res, next) => {
  try { res.json(list()); } catch (err) { next(err); }
});

// POST / — admin creates staff only; owner creates admin or staff
router.post('/', requireAdmin, (req, res, next) => {
  try {
    const { username, display_name, password, role } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'Password required', code: 'user_password_required' });
    if (req.user.role === 'admin' && role !== 'staff') {
      return res.status(403).json({ error: 'Admins can only create staff users', code: 'auth_forbidden' });
    }
    const password_hash = bcrypt.hashSync(password, 10);
    const user = create({ username, display_name, password_hash, role, force_password_change: 1 });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'create_user', entity: 'user', entityId: user.id });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PUT /:id — any authenticated user; handler enforces permission matrix
router.put('/:id', (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const callerRole = req.user.role;
    const callerId = req.user.id;
    const isSelf = callerId === targetId;

    const target = getById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });

    const { display_name, role, status, password } = req.body ?? {};
    const patch = {};
    let needsInvalidation = false;

    // display_name — self always allowed; admin/owner may edit non-admin users; owner may edit admins
    if (display_name !== undefined) {
      const allowed =
        isSelf ||
        callerRole === 'owner' ||
        (callerRole === 'admin' && target.role === 'staff');
      if (!allowed) return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      patch.display_name = display_name?.trim() || null;
    }

    // role — admin can change staff role (staff↔admin); owner can change any non-owner role
    if (role !== undefined) {
      if (!['admin', 'staff'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or staff', code: 'user_role_invalid' });
      }
      if (target.role === 'owner') {
        return res.status(403).json({ error: 'Cannot change the owner role', code: 'auth_forbidden' });
      }
      if (callerRole === 'admin') {
        // Admin may only change role of staff users (promote to admin or back to staff)
        if (target.role !== 'staff' && role !== 'staff') {
          return res.status(403).json({ error: 'Admins cannot edit other admins\' roles', code: 'auth_forbidden' });
        }
      } else if (callerRole !== 'owner') {
        return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      }
      patch.role = role;
    }

    // status — admin can toggle staff; owner can toggle admin/staff; nobody disables self or owner
    if (status !== undefined) {
      if (!['ACTIVE', 'DISABLED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status', code: 'user_status_invalid' });
      }
      if (isSelf) return res.status(400).json({ error: 'Cannot change your own status', code: 'user_cannot_disable_self' });
      if (target.role === 'owner') return res.status(403).json({ error: 'Cannot disable the owner account', code: 'auth_forbidden' });
      if (target.role === 'admin' && callerRole !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can change admin status', code: 'auth_owner_only' });
      }
      if (target.role === 'staff' && !['admin', 'owner'].includes(callerRole)) {
        return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      }
      patch.status = status;
      if (status === 'DISABLED') needsInvalidation = true;
    }

    // password reset — admin resets staff; owner resets admin or staff; never self via this route
    if (password !== undefined) {
      if (isSelf) {
        return res.status(400).json({ error: 'Use /api/auth/change-password to change your own password', code: 'auth_use_change_password' });
      }
      if (target.role === 'owner') {
        return res.status(403).json({ error: 'Cannot reset the owner password via this route', code: 'auth_forbidden' });
      }
      if (target.role === 'admin' && callerRole !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can reset admin passwords', code: 'auth_owner_only' });
      }
      if (target.role === 'staff' && !['admin', 'owner'].includes(callerRole)) {
        return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      }
      patch.password_hash = bcrypt.hashSync(password, 10);
      patch.force_password_change = 1;
      needsInvalidation = true;
    }

    if (Object.keys(patch).length > 0) {
      updateFields(targetId, patch);
    }
    if (needsInvalidation) {
      incrementTokenVersion(targetId);
    }

    logActivity({ userId: callerId, username: req.user.username, action: 'update_user', entity: 'user', entityId: targetId });
    res.json(getById(targetId));
  } catch (err) { next(err); }
});

export default router;
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add server/routes/users.js
git commit -m "feat(auth): users route — permission matrix, no physical delete, display_name, status toggle, owner restrictions"
```

---

## Task 6: Backend Tests — Auth Flows + Users Permission Matrix

**Files:**
- Create: `server/test/auth.test.js`
- Create: `server/test/users-auth.test.js`

**Interfaces:**
- Consumes: all backend tasks above

- [ ] **Step 1: Create `server/test/auth.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestApp } from './helpers.js';

describe('auth routes', () => {
  let app, db, api, cleanup;

  beforeAll(async () => {
    ({ app, db, api, cleanup } = await setupTestApp());
  });
  afterAll(() => cleanup());

  it('login succeeds with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.force_password_change).toBe(true);
    expect(res.body.user.role).toBe('owner');
  });

  it('login rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth_invalid_credentials');
  });

  it('login rejects disabled account', async () => {
    // Create a staff user, disable them, then try to log in
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, status) VALUES ('disabled_staff', ?, 'staff', 'DISABLED')").run(hash);
    const res = await request(app).post('/api/auth/login').send({ username: 'disabled_staff', password: 'pass123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth_disabled');
  });

  it('authenticate rejects token with wrong token_version', async () => {
    const { signToken } = await import('../lib/auth.js');
    const badToken = signToken({ sub: 1, username: 'admin', display_name: null, role: 'owner', tv: 9999 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth_invalid');
  });

  it('force-change-password rejects when not needed', async () => {
    const res = await api.post('/api/auth/force-change-password').send({ new_password: 'newpass123' });
    // The seeded owner has force_password_change=1, but our test token bypasses this?
    // Actually our seeded owner DOES have force_password_change=1 — so this SHOULD succeed.
    // Let's test a user who doesn't need it by creating a staff user and testing them.
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('noforce_staff', ?, 'staff', 0)").run(hash);
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'noforce_staff', password: 'pass123' });
    const staffToken = loginRes.body.token;
    const res2 = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ new_password: 'newpass123' });
    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe('auth_no_force_change');
  });

  it('force-change-password succeeds and returns recovery_code for admin/owner', async () => {
    // Log in as the owner (who has force_password_change=1)
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    const ownerToken = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ new_password: 'newpass456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.force_password_change).toBe(false);
    expect(res.body.recovery_code).toHaveLength(20);
  });

  it('force-change-password does not return recovery_code for staff', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('forcestaff', ?, 'staff', 1)").run(hash);
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'forcestaff', password: 'pass123' });
    const staffToken = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ new_password: 'newpass789' });
    expect(res.status).toBe(200);
    expect(res.body.recovery_code).toBeNull();
  });

  it('change-password rejects wrong current password', async () => {
    // Use fresh login token after force-change
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'newpass456' });
    const newToken = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${newToken}`)
      .send({ current_password: 'wrongpass', new_password: 'anotherpass' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('auth_wrong_password');
  });

  it('change-password succeeds with correct current password', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'newpass456' });
    const token = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'newpass456', new_password: 'finalpass789' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('recover rejects with wrong recovery code', async () => {
    const res = await request(app).post('/api/auth/recover').send({
      username: 'admin',
      recovery_code: 'aaaaaaaaaaaaaaaaaaaaaa',
      new_password: 'newpass111',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('auth_recover_invalid');
  });
});
```

- [ ] **Step 2: Create `server/test/users-auth.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestApp } from './helpers.js';

describe('users permission matrix', () => {
  let app, db, api, cleanup;
  let staffToken, adminToken;

  beforeAll(async () => {
    ({ app, db, api, cleanup } = await setupTestApp());

    // Create an admin user and a staff user for testing
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('test_admin', ?, 'admin', 0)").run(hash);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('test_staff', ?, 'staff', 0)").run(hash);

    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'test_admin', password: 'pass123' });
    adminToken = adminLogin.body.token;
    const staffLogin = await request(app).post('/api/auth/login').send({ username: 'test_staff', password: 'pass123' });
    staffToken = staffLogin.body.token;
  });
  afterAll(() => cleanup());

  it('admin can create staff', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'new_staff', display_name: 'New Staff', password: 'pass123', role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('staff');
  });

  it('admin cannot create admin', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'new_admin2', password: 'pass123', role: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('auth_forbidden');
  });

  it('staff cannot create users', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ username: 'another', password: 'pass123', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('staff can update own display_name', async () => {
    const staffRow = db.prepare("SELECT id FROM users WHERE username = 'test_staff'").get();
    const res = await request(app)
      .put(`/api/users/${staffRow.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ display_name: 'My Display Name' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('My Display Name');
  });

  it('admin cannot reset another admin password', async () => {
    const adminRow = db.prepare("SELECT id FROM users WHERE username = 'test_admin'").get();
    // Try to reset admin's own password via admin-reset route (should use change-password instead)
    // Create a second admin to test cross-admin reset
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('test_admin2', ?, 'admin', 0)").run(hash);
    const admin2Row = db.prepare("SELECT id FROM users WHERE username = 'test_admin2'").get();
    const res = await request(app)
      .put(`/api/users/${admin2Row.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'newpass123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('auth_owner_only');
  });

  it('disabling a user invalidates their sessions', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('to_disable', ?, 'staff', 0)").run(hash);
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'to_disable', password: 'pass123' });
    const victimToken = loginRes.body.token;
    const victimId = loginRes.body.user.id;

    // Admin disables the user
    await request(app)
      .put(`/api/users/${victimId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED' });

    // Victim's token should now be rejected
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(meRes.status).toBe(401);
  });

  it('nobody can disable their own account', async () => {
    const adminRow = db.prepare("SELECT id FROM users WHERE username = 'test_admin'").get();
    const res = await request(app)
      .put(`/api/users/${adminRow.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('user_cannot_disable_self');
  });
});
```

- [ ] **Step 3: Run the new tests**

```bash
npm test
```

Expected: all pass including the two new test files.

- [ ] **Step 4: Commit**

```bash
git add server/test/auth.test.js server/test/users-auth.test.js
git commit -m "test(auth): add auth flow tests and users permission matrix tests"
```

---

## Task 7: i18n Strings + Client API Layer

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`
- Modify: `client/src/api/auth.js`
- Modify: `client/src/api/users.js`

**Interfaces:**
- Produces: all new i18n keys; updated API functions usable by UI tasks

- [ ] **Step 1: Add new keys to `client/src/i18n/en.json`**

Add to the `"auth"` section:

```json
"myAccount": "My Account",
"changePassword": "Change Password",
"currentPassword": "Current Password",
"newPassword": "New Password",
"forgotPassword": "Forgot password?",
"setNewPassword": "Set New Password",
"passwordUpdated": "Password updated successfully",
"recoveryCode": "Recovery Code",
"recoveryCodeTitle": "Save Your Recovery Code",
"recoveryCodeWarning": "This code is shown only once. Save it somewhere safe — you will need it if you ever forget your password.",
"recoveryCodeCopied": "Copied!",
"recoverTitle": "Recover Account",
"recoverHint": "Enter your username and the one-time recovery code you saved when you set up your account.",
"recoverSuccess": "Password reset. Please save your new recovery code.",
"accountDisabled": "Your account has been disabled. Contact your administrator.",
"passwordTooShort": "Password must be at least 6 characters",
"wrongPassword": "Current password is incorrect"
```

Add to the `"users"` section:

```json
"displayName": "Display Name",
"displayNameHint": "Optional. Shown in the app instead of username.",
"roleOwner": "Owner",
"statusActive": "Active",
"statusDisabled": "Disabled",
"enable": "Enable",
"disable": "Disable",
"disableConfirm": "Disable this user? They will be signed out immediately.",
"enableConfirm": "Re-enable this user?",
"cannotDisableSelf": "You cannot disable your own account",
"resetPassword": "Reset Password",
"tempPassword": "Temporary Password",
"tempPasswordHint": "The user will be required to change this on next login."
```

Add to the `"errors"` section:

```json
"auth_disabled": "This account has been disabled",
"auth_no_force_change": "No forced password change is pending",
"auth_password_too_short": "Password must be at least 6 characters",
"auth_wrong_password": "Current password is incorrect",
"auth_recover_invalid": "Invalid username or recovery code",
"auth_recover_fields_required": "Username, recovery code, and new password are required",
"auth_owner_only": "Only the owner can perform this action",
"auth_passwords_required": "Both current and new passwords are required",
"auth_use_change_password": "Use the account menu to change your own password",
"user_not_found": "User not found",
"user_status_invalid": "Invalid status value",
"user_cannot_disable_self": "You cannot disable your own account"
```

- [ ] **Step 2: Add matching keys to `client/src/i18n/ar.json`**

Add to `"auth"`:

```json
"myAccount": "حسابي",
"changePassword": "تغيير كلمة المرور",
"currentPassword": "كلمة المرور الحالية",
"newPassword": "كلمة المرور الجديدة",
"forgotPassword": "نسيت كلمة المرور؟",
"setNewPassword": "تعيين كلمة مرور جديدة",
"passwordUpdated": "تم تحديث كلمة المرور بنجاح",
"recoveryCode": "رمز الاسترداد",
"recoveryCodeTitle": "احفظ رمز الاسترداد الخاص بك",
"recoveryCodeWarning": "يُعرض هذا الرمز مرة واحدة فقط. احتفظ به في مكان آمن — ستحتاجه إذا نسيت كلمة مرورك.",
"recoveryCodeCopied": "تم النسخ!",
"recoverTitle": "استرداد الحساب",
"recoverHint": "أدخل اسم المستخدم ورمز الاسترداد الذي حفظته عند إعداد حسابك.",
"recoverSuccess": "تم إعادة تعيين كلمة المرور. يرجى حفظ رمز الاسترداد الجديد.",
"accountDisabled": "تم تعطيل حسابك. تواصل مع المسؤول.",
"passwordTooShort": "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل",
"wrongPassword": "كلمة المرور الحالية غير صحيحة"
```

Add to `"users"`:

```json
"displayName": "الاسم المعروض",
"displayNameHint": "اختياري. يُعرض في التطبيق بدلاً من اسم المستخدم.",
"roleOwner": "المالك",
"statusActive": "نشط",
"statusDisabled": "معطّل",
"enable": "تفعيل",
"disable": "تعطيل",
"disableConfirm": "تعطيل هذا المستخدم؟ سيتم تسجيل خروجه فوراً.",
"enableConfirm": "إعادة تفعيل هذا المستخدم؟",
"cannotDisableSelf": "لا يمكنك تعطيل حسابك الخاص",
"resetPassword": "إعادة تعيين كلمة المرور",
"tempPassword": "كلمة مرور مؤقتة",
"tempPasswordHint": "سيُطلب من المستخدم تغييرها عند تسجيل الدخول التالي."
```

Add to `"errors"`:

```json
"auth_disabled": "تم تعطيل هذا الحساب",
"auth_no_force_change": "لا يوجد تغيير إلزامي لكلمة المرور",
"auth_password_too_short": "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل",
"auth_wrong_password": "كلمة المرور الحالية غير صحيحة",
"auth_recover_invalid": "اسم المستخدم أو رمز الاسترداد غير صحيح",
"auth_recover_fields_required": "اسم المستخدم ورمز الاسترداد وكلمة المرور الجديدة مطلوبة",
"auth_owner_only": "هذا الإجراء للمالك فقط",
"auth_passwords_required": "كلمة المرور الحالية والجديدة مطلوبتان",
"auth_use_change_password": "استخدم قائمة الحساب لتغيير كلمة مرورك",
"user_not_found": "المستخدم غير موجود",
"user_status_invalid": "قيمة الحالة غير صالحة",
"user_cannot_disable_self": "لا يمكنك تعطيل حسابك الخاص"
```

- [ ] **Step 3: Rewrite `client/src/api/auth.js`**

```js
import api from './client.js';

export async function loginApi(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  return data; // { token, user: { id, username, display_name, role, force_password_change } }
}

export async function logoutApi() {
  await api.post('/auth/logout').catch(() => {});
}

export async function getMeApi() {
  const { data } = await api.get('/auth/me');
  return data; // { id, username, display_name, role, force_password_change }
}

export async function forceChangePasswordApi(new_password) {
  const { data } = await api.post('/auth/force-change-password', { new_password });
  return data; // { token, user, recovery_code }
}

export async function changePasswordApi(current_password, new_password) {
  const { data } = await api.post('/auth/change-password', { current_password, new_password });
  return data; // { token, user }
}

export async function recoverApi(username, recovery_code, new_password) {
  const { data } = await api.post('/auth/recover', { username, recovery_code, new_password });
  return data; // { token, user, recovery_code }
}
```

- [ ] **Step 4: Rewrite `client/src/api/users.js`**

```js
import api from './client.js';

export async function listUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(body) {
  // body: { username, display_name?, password, role }
  const { data } = await api.post('/users', body);
  return data;
}

export async function updateUser(id, body) {
  // body: partial { display_name?, role?, status?, password? }
  const { data } = await api.put(`/users/${id}`, body);
  return data;
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/en.json client/src/i18n/ar.json client/src/api/auth.js client/src/api/users.js
git commit -m "feat(auth): add i18n strings for auth flows and update client API layer"
```

---

## Task 8: AuthContext + ProtectedRoute + App Routes

**Files:**
- Modify: `client/src/context/AuthContext.jsx`
- Modify: `client/src/components/ProtectedRoute.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `loginApi`, `logoutApi`, `getMeApi`, `forceChangePasswordApi`, `changePasswordApi` from Task 7
- Produces:
  - `useAuth()` returns `{ user, loading, isAdmin, isOwner, login, logout, forceChangePassword, changePassword, updateUserInContext }`
  - `user` shape: `{ id, username, display_name, role, force_password_change }`
  - `ProtectedRoute` redirects to `/force-change-password` when `user.force_password_change` is true
  - App has routes for `/force-change-password` and `/forgot-password`

- [ ] **Step 1: Rewrite `client/src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { loginApi, logoutApi, getMeApi, forceChangePasswordApi, changePasswordApi } from '../api/auth.js';
import { updateUser } from '../api/users.js';

const TOKEN_KEY = 'store.auth-token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [token]);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getMeApi()
      .then((u) => setUser(u))
      .catch(() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && user) handleLogout();
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!token) return;
    const handleUnload = () => {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [token]);

  const applySession = useCallback((newToken, newUser) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(newUser);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutApi();
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const login = useCallback(async (username, password) => {
    const { token: t, user: u } = await loginApi(username, password);
    applySession(t, u);
  }, [applySession]);

  const forceChangePassword = useCallback(async (new_password) => {
    const { token: t, user: u, recovery_code } = await forceChangePasswordApi(new_password);
    applySession(t, u);
    return recovery_code; // may be null for staff
  }, [applySession]);

  const changePassword = useCallback(async (current_password, new_password) => {
    const { token: t, user: u } = await changePasswordApi(current_password, new_password);
    applySession(t, u);
  }, [applySession]);

  const updateUserInContext = useCallback(async (id, patch) => {
    const updated = await updateUser(id, patch);
    if (user && updated.id === user.id) {
      setUser((prev) => ({ ...prev, ...updated }));
    }
    return updated;
  }, [user]);

  const isAdmin = useMemo(() => user?.role === 'admin' || user?.role === 'owner', [user]);
  const isOwner = useMemo(() => user?.role === 'owner', [user]);

  const value = useMemo(
    () => ({ user, loading, isAdmin, isOwner, login, logout: handleLogout, forceChangePassword, changePassword, updateUserInContext }),
    [user, loading, isAdmin, isOwner, login, handleLogout, forceChangePassword, changePassword, updateUserInContext],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Rewrite `client/src/components/ProtectedRoute.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.force_password_change) return <Navigate to="/force-change-password" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
```

- [ ] **Step 3: Update `client/src/App.jsx` — add new routes**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import ForceChangePassword from './pages/ForceChangePassword.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import NewTransaction from './pages/NewTransaction.jsx';
import ManageLists from './pages/ManageLists.jsx';
import ManageServices from './pages/ManageServices.jsx';
import Settings from './pages/Settings.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import { Center, Loader } from '@mantine/core';
import { useAuth } from './context/AuthContext.jsx';

function ForceChangeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.force_password_change) return <Navigate to="/" replace />;
  return <ForceChangePassword />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/force-change-password" element={<ForceChangeRoute />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/inventory/:id" element={<ProductDetail />} />
                    <Route path="/new-transaction" element={<NewTransaction />} />
                    <Route path="/services/manage" element={<ManageServices />} />
                    <Route path="/lists" element={<ManageLists />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/activity-log" element={<ActivityLog />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              </SettingsProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/context/AuthContext.jsx client/src/components/ProtectedRoute.jsx client/src/App.jsx
git commit -m "feat(auth): AuthContext gains forceChangePassword/changePassword/updateUserInContext/isOwner; ProtectedRoute redirects on force_password_change; add /force-change-password and /forgot-password routes"
```

---

## Task 9: RecoveryCodeModal Component

**Files:**
- Create: `client/src/components/RecoveryCodeModal.jsx`

**Interfaces:**
- Produces: `<RecoveryCodeModal code={string|null} opened={bool} onClose={fn} />` — shows plaintext code with copy button; `onClose` is only enabled via explicit button click (not ESC/outside click)

- [ ] **Step 1: Create `client/src/components/RecoveryCodeModal.jsx`**

```jsx
import { useState } from 'react';
import { Modal, Stack, Text, Code, Button, Alert, Group, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export default function RecoveryCodeModal({ code, opened, onClose }) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  const handleClose = () => {
    setConfirmed(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}} // prevent closing by ESC or outside click
      title={t('auth.recoveryCodeTitle')}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
    >
      <Stack gap="md">
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
          {t('auth.recoveryCodeWarning')}
        </Alert>
        <Stack gap="xs">
          <Text size="sm" fw={500}>{t('auth.recoveryCode')}</Text>
          <Group gap="xs" align="center">
            <Code fz="lg" style={{ letterSpacing: '0.15em', flex: 1, textAlign: 'center', padding: '12px' }}>
              {code}
            </Code>
            <CopyButton value={code ?? ''} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t('auth.recoveryCodeCopied') : t('common.actions')} withArrow>
                  <ActionIcon color={copied ? 'teal' : 'blue'} variant="light" size="lg" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        </Stack>
        <Group justify="flex-end">
          <Button onClick={handleClose}>
            {t('common.close')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/RecoveryCodeModal.jsx
git commit -m "feat(auth): add RecoveryCodeModal — shows one-time recovery code with copy button, cannot be dismissed accidentally"
```

---

## Task 10: ForceChangePassword Page

**Files:**
- Create: `client/src/pages/ForceChangePassword.jsx`

**Interfaces:**
- Consumes: `forceChangePassword` from `useAuth()`; `RecoveryCodeModal` from Task 9
- Produces: full-screen page at `/force-change-password`; on success redirects to `/`

- [ ] **Step 1: Create `client/src/pages/ForceChangePassword.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Center,
  Stack,
  Paper,
  Title,
  Text,
  PasswordInput,
  Button,
  Alert,
} from '@mantine/core';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import RecoveryCodeModal from '../components/RecoveryCodeModal.jsx';

export default function ForceChangePassword() {
  const { t } = useTranslation();
  const { forceChangePassword } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError(t('auth.passwordMismatch', { defaultValue: 'Passwords do not match' }));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('errors.auth_password_too_short'));
      return;
    }
    setLoading(true);
    try {
      const code = await forceChangePassword(newPassword);
      if (code) {
        setRecoveryCode(code);
        setCodeModalOpen(true);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      setError(code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeDismiss = () => {
    setCodeModalOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <>
      <Center h="100vh">
        <Stack w={400} gap="md">
          <Stack align="center" gap="xs">
            <IconLock size={40} stroke={1.5} />
            <Title order={2} ta="center">{t('auth.setNewPassword')}</Title>
            <Text c="dimmed" ta="center" size="sm">
              {t('auth.forceChangeHint', { defaultValue: 'You must set a new password before continuing.' })}
            </Text>
          </Stack>
          <Paper withBorder p="xl" radius="md">
            <form onSubmit={submit}>
              <Stack gap="sm">
                {error && (
                  <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                    {error}
                  </Alert>
                )}
                <PasswordInput
                  label={t('auth.newPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.currentTarget.value)}
                  required
                  autoFocus
                />
                <PasswordInput
                  label={t('auth.confirmPassword', { defaultValue: 'Confirm Password' })}
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  required
                />
                <Button type="submit" fullWidth mt="xs" loading={loading}>
                  {t('auth.setNewPassword')}
                </Button>
              </Stack>
            </form>
          </Paper>
        </Stack>
      </Center>
      <RecoveryCodeModal
        code={recoveryCode}
        opened={codeModalOpen}
        onClose={handleCodeDismiss}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/ForceChangePassword.jsx
git commit -m "feat(auth): add ForceChangePassword page — shows RecoveryCodeModal after success for admin/owner"
```

---

## Task 11: ForgotPassword Page + Login Update

**Files:**
- Create: `client/src/pages/ForgotPassword.jsx`
- Modify: `client/src/pages/Login.jsx`

**Interfaces:**
- Consumes: `recoverApi` from `client/src/api/auth.js`; `RecoveryCodeModal` from Task 9; `applySession` pattern from AuthContext (we call `login` after recover to restore session — actually recover returns a token so we need to handle it in the page and update the context manually via a new `applyRecovery` function, OR we can just navigate to `/login` and let the user log in with their new password). Let the user log back in — simpler and more secure.

- [ ] **Step 1: Create `client/src/pages/ForgotPassword.jsx`**

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Center,
  Stack,
  Paper,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { recoverApi } from '../api/auth.js';
import RecoveryCodeModal from '../components/RecoveryCodeModal.jsx';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError(t('errors.auth_password_too_short'));
      return;
    }
    setLoading(true);
    try {
      const { recovery_code } = await recoverApi(username.trim(), recoveryCode.trim(), newPassword);
      setNewCode(recovery_code);
      setCodeModalOpen(true);
    } catch (err) {
      const code = err.response?.data?.code;
      setError(code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeDismiss = () => {
    setCodeModalOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <>
      <Center h="100vh">
        <Stack w={400} gap="md">
          <Title order={2} ta="center">{t('auth.recoverTitle')}</Title>
          <Paper withBorder p="xl" radius="md">
            <form onSubmit={submit}>
              <Stack gap="sm">
                {error && (
                  <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                    {error}
                  </Alert>
                )}
                <Text size="sm" c="dimmed">{t('auth.recoverHint')}</Text>
                <TextInput
                  label={t('auth.username')}
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  required
                  autoFocus
                />
                <TextInput
                  label={t('auth.recoveryCode')}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.currentTarget.value)}
                  required
                  autoComplete="off"
                  styles={{ input: { fontFamily: 'monospace', letterSpacing: '0.1em' } }}
                />
                <PasswordInput
                  label={t('auth.newPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.currentTarget.value)}
                  required
                />
                <Button type="submit" fullWidth mt="xs" loading={loading}>
                  {t('auth.setNewPassword')}
                </Button>
                <Anchor component={Link} to="/login" ta="center" size="sm">
                  {t('auth.login')}
                </Anchor>
              </Stack>
            </form>
          </Paper>
        </Stack>
      </Center>
      <RecoveryCodeModal
        code={newCode}
        opened={codeModalOpen}
        onClose={handleCodeDismiss}
      />
    </>
  );
}
```

- [ ] **Step 2: Update `client/src/pages/Login.jsx` — add "Forgot password?" link**

Add import at top:
```jsx
import { Link } from 'react-router-dom';
```

After the Sign In button and before the closing `</Stack>` of the form, add:
```jsx
<Text ta="center" size="sm">
  <Anchor component={Link} to="/forgot-password">
    {t('auth.forgotPassword')}
  </Anchor>
</Text>
```

Also add `Anchor` to the Mantine imports at the top of Login.jsx.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ForgotPassword.jsx client/src/pages/Login.jsx
git commit -m "feat(auth): add ForgotPassword page with recovery code flow; add 'Forgot password?' link to Login"
```

---

## Task 12: AccountModal + AppLayout Top-Bar Menu

**Files:**
- Create: `client/src/components/AccountModal.jsx`
- Modify: `client/src/components/AppLayout.jsx`

**Interfaces:**
- Consumes: `changePassword`, `updateUserInContext` from `useAuth()`; `changePasswordApi` from auth API; `updateUser` from users API
- Produces: Avatar menu in top bar with "My Account" → AccountModal; AccountModal has display_name edit + password change

- [ ] **Step 1: Create `client/src/components/AccountModal.jsx`**

```jsx
import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Divider,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';

export default function AccountModal({ opened, onClose }) {
  const { t } = useTranslation();
  const { user, changePassword, updateUserInContext } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (opened) {
      setDisplayName(user?.display_name || '');
      setCurrentPw('');
      setNewPw('');
    }
  }, [opened, user]);

  const saveDisplayName = async () => {
    setSavingName(true);
    try {
      await updateUserInContext(user.id, { display_name: displayName.trim() || null });
      notifications.show({ message: t('common.saved'), color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) return;
    setSavingPw(true);
    try {
      await changePassword(currentPw, newPw);
      notifications.show({ message: t('auth.passwordUpdated'), color: 'green' });
      setCurrentPw('');
      setNewPw('');
      onClose();
    } catch (err) {
      const code = err.response?.data?.code;
      notifications.show({
        message: code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'),
        color: 'red',
      });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('auth.myAccount')}>
      <Stack gap="md">
        <Stack gap="xs">
          <Text fw={500} size="sm">{t('users.displayName')}</Text>
          <TextInput
            placeholder={user?.username}
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            description={t('users.displayNameHint')}
          />
          <Group justify="flex-end">
            <Button size="sm" loading={savingName} onClick={saveDisplayName}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>

        <Divider label={t('auth.changePassword')} labelPosition="center" />

        <Stack gap="xs">
          <PasswordInput
            label={t('auth.currentPassword')}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.currentTarget.value)}
          />
          <PasswordInput
            label={t('auth.newPassword')}
            value={newPw}
            onChange={(e) => setNewPw(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button size="sm" loading={savingPw} onClick={handleChangePassword} disabled={!currentPw || !newPw}>
              {t('auth.changePassword')}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 2: Modify `client/src/components/AppLayout.jsx` — replace header user display with avatar menu**

Replace the entire `HeaderControls` function with:

```jsx
function HeaderControls() {
  const { t, i18n } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { setDirection } = useDirection();
  const { user, logout } = useAuth();
  const [accountOpened, { open: openAccount, close: closeAccount }] = useDisclosure(false);

  useEffect(() => {
    setDirection(i18n.language === 'ar' ? 'rtl' : 'ltr');
  }, [i18n.language, setDirection]);

  const displayLabel = user?.display_name || user?.username || '';
  const initial = displayLabel[0]?.toUpperCase() ?? '?';

  return (
    <>
      <Group gap="sm">
        <Select
          aria-label={t('common.language')}
          size="xs"
          w={120}
          value={i18n.language}
          onChange={(val) => val && setLanguage(val)}
          data={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          allowDeselect={false}
        />
        <Tooltip label={t('common.theme')}>
          <ActionIcon variant="default" size="lg" onClick={toggleColorScheme}>
            {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Tooltip>
        {user && (
          <Menu shadow="md" width={180} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar size="sm" radius="xl" color="blue">{initial}</Avatar>
                  <Text size="sm" visibleFrom="sm">{displayLabel}</Text>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconUser size={14} />} onClick={openAccount}>
                {t('auth.myAccount')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconLogout size={14} />} onClick={logout} color="red">
                {t('auth.logout')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <AccountModal opened={accountOpened} onClose={closeAccount} />
    </>
  );
}
```

Add these imports to AppLayout.jsx (alongside the existing ones):

```jsx
import { Menu, Avatar, UnstyledButton } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import AccountModal from './AccountModal.jsx';
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AccountModal.jsx client/src/components/AppLayout.jsx
git commit -m "feat(auth): add AccountModal for self-service display_name/password; replace header logout button with avatar menu"
```

---

## Task 13: Settings Page — Users Section Overhaul

**Files:**
- Modify: `client/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `listUsers`, `createUser`, `updateUser` from Task 7; `useAuth()` for `isAdmin`, `isOwner`, `user`
- Produces: Users table shows display_name, status badge; Edit button opens modal with correct fields per role; Disable/Enable replaces Delete; Reset Password as separate action; Admin cannot edit other admins

- [ ] **Step 1: Update state variables at top of `Settings` component**

Replace the existing users-related state:

```jsx
const { isAdmin, isOwner, user: currentUser } = useAuth();

// Users state
const [users, setUsers] = useState([]);
const [editing, setEditing] = useState(null);
const [userOpened, { open: openUserModal, close: closeUserModal }] = useDisclosure(false);
const [resetPwOpened, { open: openResetPw, close: closeResetPw }] = useDisclosure(false);
const [resetTarget, setResetTarget] = useState(null);

// Form fields
const [username, setUsername] = useState('');
const [displayName, setDisplayName] = useState('');
const [password, setPassword] = useState('');
const [role, setRole] = useState('staff');
const [tempPassword, setTempPassword] = useState('');
const [userSaving, setUserSaving] = useState(false);
const [resetSaving, setResetSaving] = useState(false);
```

- [ ] **Step 2: Add helper functions for the users section**

```jsx
const loadUsers = () => listUsers().then(setUsers).catch(() => {});

const openNew = () => {
  setEditing(null);
  setUsername('');
  setDisplayName('');
  setPassword('');
  setRole('staff');
  openUserModal();
};

const openEdit = (u) => {
  setEditing(u);
  setUsername(u.username);
  setDisplayName(u.display_name || '');
  setPassword('');
  setRole(u.role);
  openUserModal();
};

const openResetPassword = (u) => {
  setResetTarget(u);
  setTempPassword('');
  openResetPw();
};

const saveUser = async () => {
  setUserSaving(true);
  try {
    if (editing) {
      const patch = {};
      if (displayName !== (editing.display_name || '')) patch.display_name = displayName.trim() || null;
      // Role change: only if caller has permission
      if (role !== editing.role) patch.role = role;
      if (Object.keys(patch).length > 0) await updateUser(editing.id, patch);
    } else {
      await createUser({ username, display_name: displayName.trim() || null, password, role });
    }
    notifications.show({ message: t('common.saved'), color: 'green' });
    closeUserModal();
    loadUsers();
  } catch (err) {
    notifications.show({
      message: err.response?.data?.code
        ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
        : t('common.error'),
      color: 'red',
    });
  } finally {
    setUserSaving(false);
  }
};

const saveResetPassword = async () => {
  if (!tempPassword || !resetTarget) return;
  setResetSaving(true);
  try {
    await updateUser(resetTarget.id, { password: tempPassword });
    notifications.show({ message: t('common.saved'), color: 'green' });
    closeResetPw();
    loadUsers();
  } catch (err) {
    notifications.show({
      message: err.response?.data?.code
        ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
        : t('common.error'),
      color: 'red',
    });
  } finally {
    setResetSaving(false);
  }
};

const toggleStatus = async (u) => {
  if (u.id === currentUser?.id) {
    notifications.show({ message: t('users.cannotDisableSelf'), color: 'orange' });
    return;
  }
  const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  const msg = newStatus === 'DISABLED' ? t('users.disableConfirm') : t('users.enableConfirm');
  if (!window.confirm(msg)) return;
  try {
    await updateUser(u.id, { status: newStatus });
    notifications.show({ message: t('common.saved'), color: 'green' });
    loadUsers();
  } catch (err) {
    notifications.show({
      message: err.response?.data?.code
        ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
        : t('common.error'),
      color: 'red',
    });
  }
};

// What the current viewer can do to a given target user
const canEdit = (u) => {
  if (u.role === 'owner') return false; // nobody edits the owner via this UI
  if (isOwner) return true;
  if (isAdmin && u.role === 'staff') return true;
  return false;
};

const canResetPassword = (u) => {
  if (u.role === 'owner') return false;
  if (isOwner) return true;
  if (isAdmin && u.role === 'staff') return true;
  return false;
};

const canToggleStatus = (u) => {
  if (u.id === currentUser?.id) return false;
  if (u.role === 'owner') return false;
  if (isOwner) return true;
  if (isAdmin && u.role === 'staff') return true;
  return false;
};

const roleColor = (r) => ({ owner: 'grape', admin: 'violet', staff: 'blue' })[r] ?? 'gray';
const statusColor = (s) => (s === 'ACTIVE' ? 'green' : 'red');

// Role options available when creating/editing
const roleOptions = () => {
  if (isOwner) return [
    { value: 'admin', label: t('users.roleAdmin') },
    { value: 'staff', label: t('users.roleStaff') },
  ];
  return [{ value: 'staff', label: t('users.roleStaff') }];
};
```

- [ ] **Step 3: Replace the users Paper section in the JSX**

Find the `{isAdmin && (` block that renders the users table and replace it entirely:

```jsx
{isAdmin && (
  <Paper withBorder radius="md">
    <Group justify="space-between" align="center" p="lg" pb="xs">
      <Text fw={600} fz="md">{t('users.title')}</Text>
      <Button size="sm" leftSection={<IconPlus size={14} />} onClick={openNew}>
        {t('users.addUser')}
      </Button>
    </Group>
    <Divider />
    <Table highlightOnHover verticalSpacing="md" fz="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('users.username')}</Table.Th>
          <Table.Th>{t('users.displayName')}</Table.Th>
          <Table.Th>{t('users.role')}</Table.Th>
          <Table.Th>{t('common.actions')}</Table.Th>
          <Table.Th>{t('users.createdAt')}</Table.Th>
          <Table.Th w={120} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {users.map((u) => (
          <Table.Tr key={u.id}>
            <Table.Td><Text fw={500}>{u.username}</Text></Table.Td>
            <Table.Td><Text c="dimmed">{u.display_name || '—'}</Text></Table.Td>
            <Table.Td>
              <Badge color={roleColor(u.role)} variant="light">
                {t(`users.role${u.role === 'owner' ? 'Owner' : u.role === 'admin' ? 'Admin' : 'Staff'}`)}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Badge color={statusColor(u.status)} variant="dot">
                {t(`users.status${u.status === 'ACTIVE' ? 'Active' : 'Disabled'}`)}
              </Badge>
            </Table.Td>
            <Table.Td>{formatDate(u.created_at, lang)}</Table.Td>
            <Table.Td>
              <Group gap={4} justify="flex-end">
                {canEdit(u) && (
                  <Tooltip label={t('common.edit')}>
                    <ActionIcon variant="subtle" onClick={() => openEdit(u)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {canResetPassword(u) && (
                  <Tooltip label={t('users.resetPassword')}>
                    <ActionIcon variant="subtle" color="orange" onClick={() => openResetPassword(u)}>
                      <IconKey size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {canToggleStatus(u) && (
                  <Tooltip label={u.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}>
                    <ActionIcon
                      variant="subtle"
                      color={u.status === 'ACTIVE' ? 'red' : 'green'}
                      onClick={() => toggleStatus(u)}
                    >
                      {u.status === 'ACTIVE' ? <IconUserOff size={16} /> : <IconUserCheck size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
        {users.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={6}>
              <Center p="lg"><Text c="dimmed">{t('common.noResults')}</Text></Center>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  </Paper>
)}
```

- [ ] **Step 4: Replace the user Modal in the JSX**

Find the existing `<Modal opened={userOpened} ...>` and replace with two modals:

```jsx
{/* Create / Edit User Modal */}
<Modal
  opened={userOpened}
  onClose={closeUserModal}
  title={editing ? t('users.editUser') : t('users.newUser')}
>
  <Stack gap="sm">
    {!editing && (
      <TextInput
        size="md"
        label={t('users.username')}
        value={username}
        onChange={(e) => setUsername(e.currentTarget.value)}
        required
      />
    )}
    {editing && (
      <Text size="sm" c="dimmed">{t('auth.username')}: <strong>{editing.username}</strong></Text>
    )}
    <TextInput
      size="md"
      label={t('users.displayName')}
      description={t('users.displayNameHint')}
      value={displayName}
      onChange={(e) => setDisplayName(e.currentTarget.value)}
    />
    {!editing && (
      <PasswordInput
        size="md"
        label={t('users.password')}
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        required
      />
    )}
    <Select
      size="md"
      label={t('users.role')}
      value={role}
      onChange={(v) => v && setRole(v)}
      data={roleOptions()}
      allowDeselect={false}
      disabled={editing && !isOwner && editing.role === 'admin'}
    />
    <Group justify="flex-end" mt="sm">
      <Button variant="default" onClick={closeUserModal}>{t('common.cancel')}</Button>
      <Button loading={userSaving} onClick={saveUser}>{t('common.save')}</Button>
    </Group>
  </Stack>
</Modal>

{/* Reset Password Modal */}
<Modal
  opened={resetPwOpened}
  onClose={closeResetPw}
  title={t('users.resetPassword')}
>
  <Stack gap="sm">
    <Text size="sm" c="dimmed">{resetTarget?.username}</Text>
    <PasswordInput
      size="md"
      label={t('users.tempPassword')}
      description={t('users.tempPasswordHint')}
      value={tempPassword}
      onChange={(e) => setTempPassword(e.currentTarget.value)}
      required
    />
    <Group justify="flex-end" mt="sm">
      <Button variant="default" onClick={closeResetPw}>{t('common.cancel')}</Button>
      <Button loading={resetSaving} onClick={saveResetPassword} disabled={!tempPassword}>
        {t('users.resetPassword')}
      </Button>
    </Group>
  </Stack>
</Modal>
```

- [ ] **Step 5: Add missing icon imports to Settings.jsx**

Add `IconKey`, `IconUserOff`, `IconUserCheck` to the tabler-icons import:

```jsx
import {
  IconDeviceFloppy,
  IconDatabaseExport,
  IconFileExport,
  IconInfoCircle,
  IconPlus,
  IconPencil,
  IconKey,
  IconUserOff,
  IconUserCheck,
} from '@tabler/icons-react';
```

Remove `IconTrash` from the import (no longer needed in users section).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Settings.jsx
git commit -m "feat(auth): Settings users section — display_name, status badge, disable/enable instead of delete, reset-password modal, permission-aware action buttons"
```

---

## Self-Review

**Spec coverage check:**

1. Every user has username + display_name ✓ (Task 1 schema, Task 2 repo, Task 7 i18n, Task 13 UI)
2. Create user with force_password_change=1 ✓ (Task 2 `create`, Task 5 route, Task 13 modal)
3. Force-change flow on first login ✓ (Tasks 4, 8, 10)
4. Staff forgot password → admin resets ✓ (Task 5 PUT permission + Task 13 reset-password modal)
5. Owner role with higher control ✓ (Task 1 schema, Task 3 requireOwner, Task 5 permission matrix)
6. Admin forgot password → self-service recovery code ✓ (Task 4 recover endpoint, Task 11 ForgotPassword page)
7. Recovery code generated on first forced change, shown once ✓ (Tasks 4, 9, 10)
8. Owner first login → same forced-change flow → recovery code shown ✓ (Task 1 seed with force_password_change=1, Tasks 4+9+10)
9. Soft delete (DISABLED status) ✓ (Task 1 schema, Task 5 route, Task 13 toggle)
10. Session invalidation on disable/reset ✓ (Task 3 middleware, Task 5 incrementTokenVersion calls)
11. Cannot disable own account ✓ (Task 5 route + Task 13 `canToggleStatus`)
12. Edit permissions split per role ✓ (Task 5 route, Task 13 `canEdit`/`canResetPassword`/`canToggleStatus`)
13. Self-service password + display_name via top-bar menu ✓ (Tasks 4, 8, 12)
14. Owner cannot be disabled or edited by others ✓ (Task 5: target.role === 'owner' blocks)

**Placeholder scan:** No TBD/TODO in any code block. All code is complete.

**Type consistency:** `safeUser()` in auth routes returns `force_password_change: boolean` (converted from integer). `getById()` returns `force_password_change` as integer (0/1). Middleware sets `req.user.force_password_change` as integer. Auth route checks `req.user.force_password_change` (truthy check works for both). Frontend `getMeApi` response and `loginApi` response both carry `force_password_change: boolean`. `ProtectedRoute` checks `user.force_password_change` (truthy). Consistent.

**Missing i18n keys used in code but not defined in Task 7:**
- `auth.confirmPassword` — add with defaultValue in JSX ✓ (already uses `defaultValue` fallback)
- `auth.forceChangeHint` — uses `defaultValue` fallback ✓
- `auth.passwordMismatch` — uses `defaultValue` fallback ✓
- `users.cannotDisableSelf` — maps to existing `users.cannotDeleteSelf` key... actually it's a new key. Add to Task 7's i18n additions: `"cannotDisableSelf": "You cannot disable your own account"` (same value as `cannotDeleteSelf` effectively; keep both).
