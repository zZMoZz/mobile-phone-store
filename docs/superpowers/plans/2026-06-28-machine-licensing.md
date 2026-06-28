# Machine Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the app to the laptop it is installed on — moving the project to another machine shows a blocking activation screen until a valid license key is entered.

**Architecture:** On every non-API GET request the `requireLicense` middleware reads a license key from `data/license.key`; it validates the key as `HMAC-SHA256(windowsMachineGuid, SECRET_KEY)` and either passes the request through or serves a self-contained bilingual activation HTML page. Activation is a `POST /api/license/activate` endpoint that writes the key to `data/license.key` on success. A standalone developer script generates keys given a machine GUID.

**Tech Stack:** Node.js ESM, `node:crypto` (built-in HMAC), `node:child_process` (registry read), `better-sqlite3` (not used for license — flat file in `data/`), Express, Vitest + Supertest.

## Global Constraints

- ESM everywhere — all files must use `import`/`export`, `.js` extensions in imports.
- Secret key is a 64-char hex string hardcoded in `server/lib/license.js` — never commit the real value to a public repo.
- `data/` directory is gitignored — `data/license.key` is the only persistent license artifact.
- License key format: lowercase 64-char hex string (output of `crypto.createHmac('sha256', SECRET).update(machineId).digest('hex')`).
- Middleware must never block `/api/*`, `/assets/*`, or `/uploads/*` paths.
- All i18n strings in activation HTML are inline (no i18n system) — bilingual Arabic + English in the same element.
- Existing tests all call `/api/*` routes and are unaffected by the new middleware (which skips `/api/*`).

---

### Task 1: Core license library

**Files:**
- Modify: `server/db/paths.js`
- Create: `server/lib/machine.js`
- Create: `server/lib/license.js`
- Test: `server/test/license.test.js`

**Interfaces:**
- Produces:
  - `getMachineId() → string` — throws `Error` if not Windows or registry read fails; result is cached
  - `generateKey(machineId: string) → string` — 64-char hex HMAC
  - `validateKey(machineId: string, key: string | null) → boolean`
  - `readStoredKey() → string | null` — reads `LICENSE_PATH`, returns null if missing
  - `writeKey(key: string) → void` — writes key to `LICENSE_PATH`
  - `LICENSE_PATH: string` — exported from `paths.js`

- [ ] **Step 1: Write the failing tests**

Create `server/test/license.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateKey, validateKey } from '../lib/license.js';

describe('license lib', () => {
  it('generateKey returns a 64-char lowercase hex string', () => {
    const key = generateKey('some-machine-id');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validateKey accepts the correct key for a machine', () => {
    const id = 'test-machine-abc';
    expect(validateKey(id, generateKey(id))).toBe(true);
  });

  it('validateKey rejects a key generated for a different machine', () => {
    expect(validateKey('machine-a', generateKey('machine-b'))).toBe(false);
  });

  it('validateKey rejects null', () => {
    expect(validateKey('machine-a', null)).toBe(false);
  });

  it('validateKey rejects empty string', () => {
    expect(validateKey('machine-a', '')).toBe(false);
  });

  it('validateKey rejects non-hex garbage', () => {
    expect(validateKey('machine-a', 'not-a-hex-key')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```
npm test -- server/test/license.test.js
```

Expected: 6 tests FAIL with "Cannot find module '../lib/license.js'"

- [ ] **Step 3: Generate a SECRET_KEY for this installation**

Run in the project root:

```
node -e "import('node:crypto').then(c => console.log(c.randomBytes(32).toString('hex')))"
```

Copy the 64-char hex output — you will paste it into `license.js` in the next step. Keep this value private; it is the master key for all licenses this installation will ever issue.

- [ ] **Step 4: Add `LICENSE_PATH` to `server/db/paths.js`**

Open `server/db/paths.js`. After the `DB_PATH` line, add:

```js
export const LICENSE_PATH = process.env.STORE_LICENSE_PATH || path.join(DATA_DIR, 'license.key');
```

The full updated file:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUPS_DIR = process.env.STORE_BACKUPS_DIR || path.join(DATA_DIR, 'backups');

export const DB_PATH = process.env.STORE_DB_PATH || path.join(DATA_DIR, 'store.db');
export const LICENSE_PATH = process.env.STORE_LICENSE_PATH || path.join(DATA_DIR, 'license.key');
export const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
export const DEFAULT_PRODUCT_IMAGE = '/assets/default-product.svg';

export function ensureDataDirs() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 5: Create `server/lib/machine.js`**

```js
import { execSync } from 'node:child_process';

let _cached = null;

export function getMachineId() {
  if (_cached) return _cached;
  if (process.platform !== 'win32') throw new Error('Windows is required to run this application');
  const output = execSync(
    'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
    { encoding: 'utf8', timeout: 5000 }
  );
  const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
  if (!match) throw new Error('MachineGuid not found in Windows registry');
  _cached = match[1].trim().toLowerCase();
  return _cached;
}
```

- [ ] **Step 6: Create `server/lib/license.js`**

Replace `<YOUR_SECRET_KEY>` with the 64-char hex string you generated in Step 3:

```js
import crypto from 'node:crypto';
import fs from 'node:fs';
import { LICENSE_PATH } from '../db/paths.js';

const SECRET_KEY = '<YOUR_SECRET_KEY>';

export function generateKey(machineId) {
  return crypto.createHmac('sha256', SECRET_KEY).update(machineId).digest('hex');
}

export function validateKey(machineId, key) {
  if (!key || typeof key !== 'string' || key.length !== 64) return false;
  try {
    const expected = Buffer.from(generateKey(machineId), 'hex');
    const provided = Buffer.from(key.toLowerCase(), 'hex');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function readStoredKey() {
  try {
    return fs.readFileSync(LICENSE_PATH, 'utf8').trim();
  } catch {
    return null;
  }
}

export function writeKey(key) {
  fs.writeFileSync(LICENSE_PATH, key, 'utf8');
}
```

- [ ] **Step 7: Run tests — expect PASS**

```
npm test -- server/test/license.test.js
```

Expected: 6 tests PASS.

- [ ] **Step 8: Commit**

```
git add server/db/paths.js server/lib/machine.js server/lib/license.js server/test/license.test.js
git commit -m "feat(license): add core license library and machine ID reader"
```

---

### Task 2: Activation route

**Files:**
- Create: `server/routes/license.js`
- Modify: `server/routes/index.js`
- Test: `server/test/license-route.test.js`

**Interfaces:**
- Consumes: `getMachineId()` from `machine.js`, `validateKey()` + `writeKey()` from `license.js`
- Produces: `POST /api/license/activate` — public (no JWT required), body `{ key: string }`, responds `{ ok: true }` or `{ ok: false, error: string }`

- [ ] **Step 1: Write the failing test**

Create `server/test/license-route.test.js`:

```js
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Mock machine.js so tests never touch the Windows registry.
vi.mock('../lib/machine.js', () => ({
  getMachineId: () => 'test-machine-uuid-1234',
}));

// Import after vi.mock is hoisted.
const { generateKey } = await import('../lib/license.js');
const { setupTestApp } = await import('./helpers.js');

describe('POST /api/license/activate', () => {
  let app, cleanup;

  beforeAll(async () => {
    process.env.STORE_LICENSE_PATH = path.join(os.tmpdir(), `lic-${randomUUID()}.key`);
    ({ app, cleanup } = await setupTestApp());
  });

  afterAll(() => {
    delete process.env.STORE_LICENSE_PATH;
    cleanup();
  });

  it('rejects missing key field', async () => {
    const res = await request(app).post('/api/license/activate').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('rejects an invalid key', async () => {
    const res = await request(app).post('/api/license/activate').send({ key: 'deadbeef'.repeat(8) });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  it('accepts the correct key for the mocked machine and writes the license', async () => {
    const key = generateKey('test-machine-uuid-1234');
    const res = await request(app).post('/api/license/activate').send({ key });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```
npm test -- server/test/license-route.test.js
```

Expected: FAIL — "Cannot find module '../routes/license.js'" or 404 on the endpoint.

- [ ] **Step 3: Create `server/routes/license.js`**

```js
import { Router } from 'express';
import { getMachineId } from '../lib/machine.js';
import { validateKey, writeKey } from '../lib/license.js';

const router = Router();

router.post('/activate', (req, res) => {
  const { key } = req.body;
  if (!key) return res.json({ ok: false, error: 'No key provided' });

  let machineId;
  try {
    machineId = getMachineId();
  } catch (e) {
    return res.json({ ok: false, error: 'Cannot read machine ID' });
  }

  if (!validateKey(machineId, key)) {
    return res.json({ ok: false, error: 'Invalid license key' });
  }

  writeKey(key);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 4: Register the route in `server/routes/index.js`**

Add the import and mount it **before** the `authenticate` middleware so it is publicly accessible. The updated file:

```js
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import authRouter from './auth.js';
import licenseRouter from './license.js';
import usersRouter from './users.js';
import activityLogsRouter from './activityLogs.js';
import productsRouter from './products.js';
import transactionsRouter from './transactions.js';
import serviceTypesRouter from './serviceTypes.js';
import analyticsRouter from './analytics.js';
import settingsRouter from './settings.js';
import dataRouter from './data.js';
import { categoriesRouter, brandsRouter } from './reference.js';
import optionListsRouter from './optionLists.js';
import servicesRouter from './services.js';
import serviceShortcutsRouter from './serviceShortcuts.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Public — no auth required
router.use('/auth', authRouter);
router.use('/license', licenseRouter);

// All routes below require a valid JWT
router.use(authenticate);

router.use('/products', productsRouter);
router.use('/transactions', transactionsRouter);
router.use('/service-types', serviceTypesRouter);
router.use('/analytics', analyticsRouter);
router.use('/categories', categoriesRouter);
router.use('/brands', brandsRouter);
router.use('/option-lists', optionListsRouter);
router.use('/services', servicesRouter);
router.use('/service-shortcuts', serviceShortcutsRouter);
router.use('/settings', settingsRouter);
router.use('/users', usersRouter);
router.use('/activity-logs', activityLogsRouter);
router.use('/', dataRouter);

export default router;
```

- [ ] **Step 5: Run test — expect PASS**

```
npm test -- server/test/license-route.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 6: Run full test suite — expect no regressions**

```
npm test
```

Expected: all tests PASS. The new route is public, and the mock only applies to its own test file.

- [ ] **Step 7: Commit**

```
git add server/routes/license.js server/routes/index.js server/test/license-route.test.js
git commit -m "feat(license): add POST /api/license/activate route"
```

---

### Task 3: License middleware and mount in app

**Files:**
- Create: `server/middleware/requireLicense.js`
- Modify: `server/app.js`

**Interfaces:**
- Consumes: `getMachineId()` from `machine.js`, `validateKey()` + `readStoredKey()` from `license.js`
- Produces: Express middleware function `requireLicense(req, res, next)` — serves activation HTML when unlicensed, calls `next()` otherwise

- [ ] **Step 1: Create `server/middleware/requireLicense.js`**

```js
import { getMachineId } from '../lib/machine.js';
import { validateKey, readStoredKey } from '../lib/license.js';

const SKIP_PREFIXES = ['/api', '/assets', '/uploads'];

export function requireLicense(req, res, next) {
  if (req.method !== 'GET') return next();
  if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  let machineId;
  try {
    machineId = getMachineId();
  } catch {
    return res.send(buildActivationHtml('(unavailable)'));
  }

  if (validateKey(machineId, readStoredKey())) return next();
  res.send(buildActivationHtml(machineId));
}

function buildActivationHtml(machineId) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>هذه النسخة غير مرخصة / Unlicensed</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#e0e0e0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#16213e;border:1px solid #0f3460;border-radius:12px;padding:2rem;max-width:480px;width:90%}
h1{font-size:1.15rem;margin-bottom:.5rem;color:#e94560;line-height:1.4}
p{font-size:.875rem;color:#aaa;margin-bottom:1.25rem;line-height:1.6}
label{display:block;font-size:.75rem;color:#aaa;margin-bottom:.25rem}
input{width:100%;padding:.5rem .75rem;background:#0f3460;border:1px solid #1a4a8a;border-radius:6px;color:#e0e0e0;font-family:monospace;font-size:.8rem;margin-bottom:1.25rem}
button{width:100%;padding:.65rem;background:#e94560;border:none;border-radius:6px;color:#fff;font-size:.95rem;cursor:pointer}
button:hover{background:#c73652}
.error{color:#e94560;font-size:.8rem;margin-top:.75rem;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>هذه النسخة غير مرخصة / This copy is not licensed</h1>
  <p>أرسل معرّف الجهاز أدناه إلى المطوّر للحصول على مفتاح الترخيص.<br>Send the Machine ID below to your developer to receive a license key.</p>
  <label>معرّف الجهاز / Machine ID</label>
  <input id="mid" value="${machineId}" readonly onclick="this.select()">
  <label>مفتاح الترخيص / License Key</label>
  <input id="key" placeholder="الصق المفتاح هنا / Paste key here" autocomplete="off" spellcheck="false">
  <button onclick="activate()">تفعيل / Activate</button>
  <p class="error" id="err">مفتاح غير صحيح / Invalid license key</p>
</div>
<script>
async function activate() {
  const key = document.getElementById('key').value.trim();
  const err = document.getElementById('err');
  err.style.display = 'none';
  try {
    const r = await fetch('/api/license/activate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ key })
    });
    const data = await r.json();
    if (data.ok) { window.location.reload(); }
    else { err.style.display = 'block'; }
  } catch { err.style.display = 'block'; }
}
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: Mount the middleware in `server/app.js`**

Add the import and mount it as the very first middleware, before static files and the API router. The updated `app.js`:

```js
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT_DIR, UPLOADS_DIR, ASSETS_DIR } from './db/paths.js';
import { requireLicense } from './middleware/requireLicense.js';
import apiRouter from './routes/index.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // License gate: blocks frontend routes on unlicensed machines.
  // API routes (/api/*), assets, and uploads are always allowed through.
  app.use(requireLicense);

  // Static: bundled default assets and user-uploaded product images.
  app.use('/assets', express.static(ASSETS_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // REST API
  app.use('/api', apiRouter);

  // In production, serve the built React client and fall back to index.html
  // for client-side routing. (In dev the client is served by Vite.)
  const clientDist = path.join(ROOT_DIR, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // JSON error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Internal server error', code: err.code, params: err.params });
  });

  return app;
}
```

- [ ] **Step 3: Run full test suite — expect all pass**

```
npm test
```

Expected: all existing tests PASS. They all call `/api/*` routes which the middleware skips.

- [ ] **Step 4: Commit**

```
git add server/middleware/requireLicense.js server/app.js
git commit -m "feat(license): add requireLicense middleware — blocks frontend on unlicensed machines"
```

---

### Task 4: Startup guard

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `getMachineId()` from `machine.js`
- Produces: server exits with a clear error message if run on a non-Windows machine or if the registry read fails

- [ ] **Step 1: Update `server/index.js`**

Add the `getMachineId` import and call it before `seed()`. If it throws, log a clear message and exit:

```js
import { createApp } from './app.js';
import { seed } from './db/seed.js';
import { runScheduledBackup, getLastBackupAt } from './lib/backup.js';
import { get as getSettings } from './repositories/settings.js';
import { getMachineId } from './lib/machine.js';

const PORT = process.env.PORT || 4000;
const HOUR_MS = 60 * 60 * 1000;

// Verify we can read the machine ID before doing anything else.
// This also warms the cache so the license middleware never hits the registry again.
try {
  getMachineId();
} catch (e) {
  console.error('\n[License] Cannot read machine ID:', e.message);
  console.error('[License] This application requires Windows to run.\n');
  process.exit(1);
}

// Ensure schema + default reference data exist before serving.
seed();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Mobile Phone Store server running at http://localhost:${PORT}`);

  setInterval(async () => {
    const intervalHours = getSettings()?.backup_interval_hours || 12;
    if (Date.now() - getLastBackupAt() >= intervalHours * HOUR_MS) {
      await runScheduledBackup();
    }
  }, HOUR_MS);
});
```

- [ ] **Step 2: Manual smoke test — server still starts**

```
npm start
```

Expected: server starts normally, no errors, `getMachineId()` is called silently and cached.

- [ ] **Step 3: Commit**

```
git add server/index.js
git commit -m "feat(license): fail fast at startup if machine ID cannot be read"
```

---

### Task 5: Developer key-generation script

**Files:**
- Create: `server/scripts/generate-license.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `generateKey()` from `license.js`
- Produces: prints license key to stdout given a machine GUID as CLI argument

- [ ] **Step 1: Create `server/scripts/generate-license.js`**

```js
import { generateKey } from '../lib/license.js';

const machineId = process.argv[2];

if (!machineId) {
  console.error('\nUsage: npm run license -- <machineGuid>\n');
  console.error('Example: npm run license -- 6a2f3c1d-4b5e-6f7a-8b9c-0d1e2f3a4b5c\n');
  process.exit(1);
}

const key = generateKey(machineId.trim().toLowerCase());

console.log('');
console.log('Machine ID :', machineId);
console.log('License key:', key);
console.log('');
console.log('Send the license key above to the store owner.');
console.log('');
```

- [ ] **Step 2: Add the `license` script to `package.json`**

In the `"scripts"` section, add after `"reset-admin"`:

```json
"license": "node server/scripts/generate-license.js"
```

The updated scripts block:

```json
"scripts": {
  "migrate": "node server/db/migrate.js",
  "seed": "node server/db/seed.js",
  "seed:demo": "node server/db/seed-demo.js",
  "server": "node server/index.js",
  "server:dev": "node --watch server/index.js",
  "client": "npm --prefix client run dev",
  "dev": "concurrently -n server,client -c blue,green \"npm run server:dev\" \"npm run client\"",
  "build": "npm --prefix client install && npm --prefix client run build",
  "start": "node server/index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "reset-admin": "node server/scripts/reset-admin.js",
  "license": "node server/scripts/generate-license.js"
}
```

- [ ] **Step 3: Manual test — generate a key**

```
npm run license -- 6a2f3c1d-4b5e-6f7a-8b9c-0d1e2f3a4b5c
```

Expected output:

```
Machine ID : 6a2f3c1d-4b5e-6f7a-8b9c-0d1e2f3a4b5c
License key: <64-char hex string>

Send the license key above to the store owner.
```

- [ ] **Step 4: Manual test — run with no argument**

```
npm run license
```

Expected: prints usage message and exits with code 1.

- [ ] **Step 5: Commit**

```
git add server/scripts/generate-license.js package.json
git commit -m "feat(license): add developer key-generation script (npm run license)"
```

---

## End-to-End Verification

After all tasks are complete, verify the full flow manually:

1. **Unlicensed machine:** Start the app with no `data/license.key` file. Open `http://localhost:4000`. The activation screen appears in Arabic + English showing the machine ID.

2. **Generate a key:** Run `npm run license -- <machineId from screen>`. Copy the printed key.

3. **Activate:** Paste the key into the activation field and click Activate. The page reloads and the normal app appears.

4. **Persistence:** Stop and restart the server. Open the app — it loads normally without asking for the license again.

5. **Wrong key:** Restart with a fresh `data/license.key` deleted. Enter a wrong key — the error message appears and the activation screen stays.
