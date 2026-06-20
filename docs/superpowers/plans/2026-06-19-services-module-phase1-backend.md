# Services Module — Phase 1 (Backend Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for the redesigned Services module — services with custom JSON-schema fields, reusable shared option lists, shortcut presets, pure-revenue service transactions, and a Service Revenue analytics figure — fully covered by tests.

**Architecture:** Three new bilingual reference tables (`option_lists`, `services`, `service_shortcuts`) following the repo/route pattern in `server/repositories/reference.js`. Service transactions reuse the `transactions` table (`type='service'`) with two new columns (`service_id`, `service_data` JSON snapshot); recording goes through a rewritten service branch of `transactions.create()` that stores `total = cost`, `profit = 0`, and a labeled field snapshot. Analytics treats service money as revenue only, never profit.

**Tech Stack:** Node.js + Express (ESM), better-sqlite3 (synchronous), Vitest + Supertest. JSON stored as TEXT columns, parsed/serialized in the repos.

## Global Constraints

- **ESM everywhere** (`"type": "module"`); `.js` extensions in imports.
- **DB access** only via `getDb()` (`server/db/connection.js`); wrap multi-step writes in `db.transaction(...)`.
- **Tests never touch real data:** `setupTestApp()` (`server/test/helpers.js`) sets `STORE_DB_PATH` + `STORE_BACKUPS_DIR` to temp paths before dynamically importing the app. Inside a test file, import server modules **dynamically** (a static import binds `db/paths.js` to the real DB before the temp env is set).
- **Bilingual data:** reference rows store `name_en` + `name_ar`; both required.
- **Errors** thrown from repos carry `err.status` (+ optional `err.code`); `server/app.js` returns `{ error, code }`.
- **Money** stored as plain numbers; reuse `round2()` in `transactions.js`.
- **Backend only** this phase — no client changes. The legacy `service_types` table/routes stay untouched for historical rows; nothing new uses them.

---

## File Structure

- `server/db/schema.sql` — add `option_lists`, `services`, `service_shortcuts`; add `service_id` + `service_data` to `transactions`.
- `server/db/migrate.js` — add the two `transactions` columns for existing DBs.
- `server/repositories/optionLists.js` — CRUD (JSON `options`).
- `server/repositories/services.js` — CRUD + `fields` schema validation.
- `server/repositories/serviceShortcuts.js` — CRUD (JSON `preset_values`).
- `server/repositories/transactions.js` — rewrite `type==='service'` branch of `create()`; parse `service_data` in `getById()`.
- `server/repositories/analytics.js` — service money = revenue only.
- `server/routes/{optionLists,services,serviceShortcuts}.js` + mount in `server/routes/index.js`.
- `server/db/seed.js` — seed Providers list + 3 services + shortcuts; stop seeding `SERVICE_TYPES`.
- `server/test/{optionLists,services,serviceShortcuts}.test.js`; edits to `transactions.test.js` and `analytics.test.js`.

---

### Task 1: Schema + migration for new tables and transaction columns

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/db/migrate.js`
- Test: `server/test/services.test.js` (new)

**Interfaces:**
- Produces: tables `option_lists(id,name_en,name_ar,options TEXT)`, `services(id,name_en,name_ar,fields TEXT,sort_order)`, `service_shortcuts(id,service_id,label_en,label_ar,color,sort_order,preset_values TEXT)`; columns `transactions.service_id`, `transactions.service_data`.

- [ ] **Step 1: Add new tables to `schema.sql`** — after the `brands` table block, before `CREATE TABLE IF NOT EXISTS products`:

```sql
CREATE TABLE IF NOT EXISTS option_lists (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en   TEXT NOT NULL,
  name_ar   TEXT NOT NULL,
  options   TEXT NOT NULL DEFAULT '[]'    -- JSON array of strings
);

CREATE TABLE IF NOT EXISTS services (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en    TEXT NOT NULL,
  name_ar    TEXT NOT NULL,
  fields     TEXT NOT NULL DEFAULT '[]',  -- JSON array of field defs
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_shortcuts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id    INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  label_en      TEXT NOT NULL,
  label_ar      TEXT NOT NULL,
  color         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  preset_values TEXT NOT NULL DEFAULT '{}' -- JSON object {fieldKey: value, cost?}
);
```

- [ ] **Step 2: Add transaction columns to `schema.sql`** — inside the `transactions` `CREATE TABLE`, right after the `service_type_id` line:

```sql
  service_id      INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_data    TEXT,                        -- JSON snapshot for service transactions
```

- [ ] **Step 3: Extend `applyColumnMigrations(db)` in `migrate.js`** — after the categories/brands `is_protected` loop:

```js
  // Transactions: service redesign columns.
  const txnCols = columns('transactions');
  if (!txnCols.includes('service_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE SET NULL');
  }
  if (!txnCols.includes('service_data')) {
    db.exec('ALTER TABLE transactions ADD COLUMN service_data TEXT');
  }
```

- [ ] **Step 4: Write the failing test** — create `server/test/services.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('services backend', () => {
  let app;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ app, db, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('has the new tables and transaction columns after seed/migrate', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['option_lists', 'services', 'service_shortcuts']));
    const txnCols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    expect(txnCols).toEqual(expect.arrayContaining(['service_id', 'service_data']));
  });
});
```

- [ ] **Step 5: Run it** — `npx vitest run server/test/services.test.js` → Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.sql server/db/migrate.js server/test/services.test.js
git commit -m "feat(services): schema + migration for services/option_lists/shortcuts"
```

---

### Task 2: Option lists repository + routes

**Files:**
- Create: `server/repositories/optionLists.js`
- Create: `server/routes/optionLists.js`
- Modify: `server/routes/index.js`
- Test: `server/test/optionLists.test.js` (new)

**Interfaces:**
- Produces: repo `{ list(), getById(id), create(data), update(id, data), remove(id) }` where rows are `{ id, name_en, name_ar, options: string[] }`. Routes mounted at `/api/option-lists` (GET `/`, POST `/`, PUT `/:id`, DELETE `/:id`).

- [ ] **Step 1: Write the failing test** — `server/test/optionLists.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('option lists API', () => {
  let app;
  let cleanup;
  beforeAll(async () => { ({ app, cleanup } = await setupTestApp()); });
  afterAll(() => cleanup());

  it('creates a list with options and reads them back as an array', async () => {
    const res = await request(app)
      .post('/api/option-lists')
      .send({ name_en: 'Providers', name_ar: 'المزودون', options: ['Vodafone', ' WE ', '', 'Orange'] });
    expect(res.status).toBe(201);
    expect(res.body.options).toEqual(['Vodafone', 'WE', 'Orange']); // trimmed, blanks removed
  });

  it('rejects a list with a missing name', async () => {
    const res = await request(app).post('/api/option-lists').send({ name_en: 'Only EN', options: [] });
    expect(res.status).toBe(400);
  });

  it('updates options and deletes', async () => {
    const created = await request(app)
      .post('/api/option-lists')
      .send({ name_en: 'Temp', name_ar: 'مؤقت', options: ['a'] });
    const upd = await request(app)
      .put(`/api/option-lists/${created.body.id}`)
      .send({ options: ['x', 'y'] });
    expect(upd.body.options).toEqual(['x', 'y']);
    expect(upd.body.name_en).toBe('Temp'); // unchanged
    const del = await request(app).delete(`/api/option-lists/${created.body.id}`);
    expect(del.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run server/test/optionLists.test.js` → Expected: FAIL (404, route not mounted).

- [ ] **Step 3: Create the repository** — `server/repositories/optionLists.js`:

```js
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
```

- [ ] **Step 4: Create the router** — `server/routes/optionLists.js`:

```js
import { Router } from 'express';
import * as optionLists from '../repositories/optionLists.js';

const router = Router();

router.get('/', (req, res) => res.json(optionLists.list()));
router.post('/', (req, res) => res.status(201).json(optionLists.create(req.body)));
router.put('/:id', (req, res) => {
  const updated = optionLists.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const ok = optionLists.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
```

- [ ] **Step 5: Mount it in `server/routes/index.js`** — add the import near the other route imports and the `router.use` near the others:

```js
import optionListsRouter from './optionLists.js';
// ...
router.use('/option-lists', optionListsRouter);
```

- [ ] **Step 6: Run it to verify it passes** — `npx vitest run server/test/optionLists.test.js` → Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/repositories/optionLists.js server/routes/optionLists.js server/routes/index.js server/test/optionLists.test.js
git commit -m "feat(services): option lists repository + routes"
```

---

### Task 3: Services repository (with field-schema validation) + routes

**Files:**
- Create: `server/repositories/services.js`
- Create: `server/routes/services.js`
- Modify: `server/routes/index.js`
- Test: `server/test/services.test.js` (extend)

**Interfaces:**
- Produces: repo `{ list(), getById(id), create(data), update(id, data), remove(id) }`; rows `{ id, name_en, name_ar, fields: FieldDef[], sort_order }`. `FieldDef = { key, label_en, label_ar, type: 'text'|'number'|'select', required: boolean, option_list_id?: number, options?: string[] }`. Routes at `/api/services` (GET, POST, PUT `/:id`, DELETE `/:id`).

- [ ] **Step 1: Write the failing tests** — append to `server/test/services.test.js` inside the existing `describe`:

```js
  it('creates a service with validated fields', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({
        name_en: 'Top-up',
        name_ar: 'شحن',
        fields: [
          { key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'select', required: true, options: ['Vodafone', 'WE'] },
          { key: 'note', label_en: 'Note', label_ar: 'ملاحظة', type: 'text', required: false },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.fields).toHaveLength(2);
    expect(res.body.fields[0].type).toBe('select');
    expect(res.body.fields[0].options).toEqual(['Vodafone', 'WE']);
  });

  it('rejects an invalid field type', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({ name_en: 'Bad', name_ar: 'سيئ', fields: [{ key: 'x', label_en: 'X', label_ar: 'س', type: 'date' }] });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate field keys', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({
        name_en: 'Dup',
        name_ar: 'مكرر',
        fields: [
          { key: 'a', label_en: 'A', label_ar: 'أ', type: 'text' },
          { key: 'a', label_en: 'A2', label_ar: 'أ٢', type: 'text' },
        ],
      });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/test/services.test.js` → Expected: FAIL (404 on POST /api/services).

- [ ] **Step 3: Create the repository** — `server/repositories/services.js`:

```js
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
```

- [ ] **Step 4: Create the router** — `server/routes/services.js` (identical shape to Task 2's router, swapping the repo import for `import * as services from '../repositories/services.js';` and calling `services.*`).

```js
import { Router } from 'express';
import * as services from '../repositories/services.js';

const router = Router();

router.get('/', (req, res) => res.json(services.list()));
router.post('/', (req, res) => res.status(201).json(services.create(req.body)));
router.put('/:id', (req, res) => {
  const updated = services.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const ok = services.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
```

- [ ] **Step 5: Mount it in `server/routes/index.js`**:

```js
import servicesRouter from './services.js';
// ...
router.use('/services', servicesRouter);
```

- [ ] **Step 6: Run it** — `npx vitest run server/test/services.test.js` → Expected: PASS (migration test + 3 new tests).

- [ ] **Step 7: Commit**

```bash
git add server/repositories/services.js server/routes/services.js server/routes/index.js server/test/services.test.js
git commit -m "feat(services): services repository with field-schema validation + routes"
```

---

### Task 4: Service shortcuts repository + routes

**Files:**
- Create: `server/repositories/serviceShortcuts.js`
- Create: `server/routes/serviceShortcuts.js`
- Modify: `server/routes/index.js`
- Test: `server/test/serviceShortcuts.test.js` (new)

**Interfaces:**
- Produces: repo `{ list(serviceId?), getById(id), create(data), update(id, data), remove(id) }`; rows `{ id, service_id, label_en, label_ar, color, sort_order, preset_values: object }`. Routes at `/api/service-shortcuts` (GET `/` with optional `?service_id=`, POST, PUT `/:id`, DELETE `/:id`).

- [ ] **Step 1: Write the failing test** — `server/test/serviceShortcuts.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('service shortcuts API', () => {
  let app;
  let cleanup;
  let serviceId;
  beforeAll(async () => {
    ({ app, cleanup } = await setupTestApp());
    const svc = await request(app)
      .post('/api/services')
      .send({ name_en: 'Top-up', name_ar: 'شحن', fields: [{ key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'text' }] });
    serviceId = svc.body.id;
  });
  afterAll(() => cleanup());

  it('creates a shortcut with preset values for a service', async () => {
    const res = await request(app)
      .post('/api/service-shortcuts')
      .send({ service_id: serviceId, label_en: 'Vodafone', label_ar: 'فودافون', color: 'red', preset_values: { provider: 'Vodafone' } });
    expect(res.status).toBe(201);
    expect(res.body.preset_values).toEqual({ provider: 'Vodafone' });
    expect(res.body.service_id).toBe(serviceId);
  });

  it('rejects a shortcut for a missing service', async () => {
    const res = await request(app)
      .post('/api/service-shortcuts')
      .send({ service_id: 999999, label_en: 'X', label_ar: 'س' });
    expect(res.status).toBe(400);
  });

  it('filters shortcuts by service_id', async () => {
    const res = await request(app).get('/api/service-shortcuts').query({ service_id: serviceId });
    expect(res.body.every((s) => s.service_id === serviceId)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/test/serviceShortcuts.test.js` → Expected: FAIL (404).

- [ ] **Step 3: Create the repository** — `server/repositories/serviceShortcuts.js`:

```js
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
  const serviceId = Number(data.service_id);
  if (!getDb().prepare('SELECT id FROM services WHERE id = ?').get(serviceId)) {
    fail(400, 'Service not found', 'shortcut_service_missing');
  }
  const label_en = (data.label_en || '').trim();
  const label_ar = (data.label_ar || '').trim();
  if (!label_en || !label_ar) fail(400, 'Both English and Arabic labels are required', 'shortcut_label_required');
  const info = getDb()
    .prepare(
      'INSERT INTO service_shortcuts (service_id, label_en, label_ar, color, sort_order, preset_values) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(serviceId, label_en, label_ar, data.color || null, Number(data.sort_order) || 0, JSON.stringify(data.preset_values || {}));
  return getById(info.lastInsertRowid);
}

export function update(id, data) {
  const existing = getById(id);
  if (!existing) return undefined;
  const label_en = (data.label_en ?? existing.label_en).trim();
  const label_ar = (data.label_ar ?? existing.label_ar).trim();
  if (!label_en || !label_ar) fail(400, 'Both English and Arabic labels are required', 'shortcut_label_required');
  const preset = data.preset_values != null ? JSON.stringify(data.preset_values) : JSON.stringify(existing.preset_values);
  const color = data.color !== undefined ? data.color || null : existing.color;
  const sort_order = data.sort_order != null ? Number(data.sort_order) : existing.sort_order;
  getDb()
    .prepare('UPDATE service_shortcuts SET label_en = ?, label_ar = ?, color = ?, sort_order = ?, preset_values = ? WHERE id = ?')
    .run(label_en, label_ar, color, sort_order, preset, id);
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM service_shortcuts WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: Create the router** — `server/routes/serviceShortcuts.js`:

```js
import { Router } from 'express';
import * as shortcuts from '../repositories/serviceShortcuts.js';

const router = Router();

router.get('/', (req, res) => res.json(shortcuts.list(req.query.service_id ?? null)));
router.post('/', (req, res) => res.status(201).json(shortcuts.create(req.body)));
router.put('/:id', (req, res) => {
  const updated = shortcuts.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const ok = shortcuts.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
```

- [ ] **Step 5: Mount it in `server/routes/index.js`**:

```js
import serviceShortcutsRouter from './serviceShortcuts.js';
// ...
router.use('/service-shortcuts', serviceShortcutsRouter);
```

- [ ] **Step 6: Run it** — `npx vitest run server/test/serviceShortcuts.test.js` → Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/repositories/serviceShortcuts.js server/routes/serviceShortcuts.js server/routes/index.js server/test/serviceShortcuts.test.js
git commit -m "feat(services): service shortcuts repository + routes"
```

---

### Task 5: Pure-revenue service transaction recording

**Files:**
- Modify: `server/repositories/transactions.js` (rewrite the `type==='service'` branch of `create()`; parse `service_data` in `getById()`)
- Test: `server/test/transactions.test.js` (replace the old fee+parts service test)

**Interfaces:**
- Consumes: `services.getById(id)` (Task 3) for field labels/required.
- Produces: a service transaction created from payload `{ type:'service', service_id, shortcut_id?, cost, field_values?: { [key]: value }, note? }`. Stored row has `total = round2(cost)`, `subtotal=0`, `fee=0`, `cost_total=0`, `profit=0`, `service_id`, and `service_data` JSON `{ service_id, service_name, shortcut_id, fields:[{label_en,label_ar,value}], cost }`. `getById()` returns it with `service_data` parsed to an object.

- [ ] **Step 1: Replace the old service test** — in `server/test/transactions.test.js`, delete the test `'records a service with a fee and parts consumed from stock'` (the `it(...)` block, lines ~76–92) and add in its place:

```js
  it('records a pure-revenue service transaction (total = cost, no profit)', async () => {
    const svc = await request(app)
      .post('/api/services')
      .send({
        name_en: 'Top-up',
        name_ar: 'شحن',
        fields: [{ key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'text', required: true }],
      });
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 100, field_values: { provider: 'Vodafone' } });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(100);
    expect(res.body.profit).toBe(0);
    expect(res.body.cost_total).toBe(0);
    expect(res.body.service_id).toBe(svc.body.id);
    expect(res.body.service_data.cost).toBe(100);
    expect(res.body.service_data.fields).toEqual([
      { label_en: 'Provider', label_ar: 'المزود', value: 'Vodafone' },
    ]);
  });

  it('rejects a service transaction missing a required field', async () => {
    const svc = await request(app)
      .post('/api/services')
      .send({
        name_en: 'Bill',
        name_ar: 'فاتورة',
        fields: [{ key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'text', required: true }],
      });
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 50, field_values: {} });
    expect(res.status).toBe(400);
  });

  it('rejects a service transaction with non-positive cost', async () => {
    const svc = await request(app).post('/api/services').send({ name_en: 'Maint', name_ar: 'صيانة', fields: [] });
    const res = await request(app)
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 0 });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/test/transactions.test.js` → Expected: FAIL (old branch computes total from fee/items, returns no `service_data`).

- [ ] **Step 3: Add a service-recording helper + import in `transactions.js`** — at the top of `server/repositories/transactions.js`, add the services import beneath the existing imports:

```js
import * as services from './services.js';
```

Then add this function above `export function create(payload)`:

```js
// Builds + inserts a pure-revenue service transaction: total = cost, profit = 0,
// no inventory movement. Snapshots the filled custom fields (with their labels) so
// history survives later edits to the service definition.
function createServiceTransaction(payload) {
  const service = services.getById(Number(payload.service_id));
  if (!service) {
    const err = new Error('Service not found');
    err.status = 400;
    err.code = 'service_missing';
    throw err;
  }
  const cost = round2(payload.cost);
  if (!(cost > 0)) {
    const err = new Error('Cost must be greater than 0');
    err.status = 400;
    err.code = 'service_cost_positive';
    throw err;
  }
  const values = payload.field_values || {};
  const snapshotFields = service.fields.map((f) => {
    const raw = values[f.key];
    const value = raw == null ? '' : String(raw).trim();
    if (f.required && !value) {
      const err = new Error(`Field "${f.label_en}" is required`);
      err.status = 400;
      err.code = 'service_field_required';
      throw err;
    }
    return { label_en: f.label_en, label_ar: f.label_ar, value };
  });

  const serviceData = JSON.stringify({
    service_id: service.id,
    service_name: service.name_en,
    shortcut_id: payload.shortcut_id ? Number(payload.shortcut_id) : null,
    fields: snapshotFields,
    cost,
  });

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO transactions (type, service_id, service_data, note, subtotal, fee, cost_total, total, profit)
       VALUES ('service', @service_id, @service_data, @note, 0, 0, 0, @total, 0)`,
    )
    .run({ service_id: service.id, service_data: serviceData, note: payload.note || null, total: cost });
  return getById(info.lastInsertRowid);
}
```

- [ ] **Step 4: Route the service type into the new helper** — in `create(payload)`, immediately after the type-validation block (after the `if (!['purchase','sale','service'].includes(type)) {...}` guard), add:

```js
  if (type === 'service') return createServiceTransaction(payload);
```

This makes the new service path bypass the old fee/items branch entirely.

- [ ] **Step 5: Parse `service_data` in `getById()`** — in `server/repositories/transactions.js`, update `getById` to parse the snapshot. Replace the `return { ...txn, items, service_type: serviceType };` line with:

```js
  const serviceData = txn.service_data ? JSON.parse(txn.service_data) : null;
  return { ...txn, items, service_type: serviceType, service_data: serviceData };
```

- [ ] **Step 6: Run it** — `npx vitest run server/test/transactions.test.js` → Expected: PASS (all transaction tests, including the 3 new service tests).

- [ ] **Step 7: Run the full suite** — `npm test` → Expected: PASS (no regressions). _Note: the old service test is gone; analytics totals still work because `totals.services` reads `SUM(total)`._

- [ ] **Step 8: Commit**

```bash
git add server/repositories/transactions.js server/test/transactions.test.js
git commit -m "feat(services): pure-revenue service transaction recording with field snapshot"
```

---

### Task 6: Analytics — service money is revenue, never profit

**Files:**
- Modify: `server/repositories/analytics.js`
- Test: `server/test/analytics.test.js` (extend)

**Interfaces:**
- Produces: `overview()` returns `totals.services` = `SUM(total)` for `type='service'`; service transactions do **not** add to `totals.profit`; the `trend` `profit` and `sales` lines come from `type='sale'` only.

- [ ] **Step 1: Write the failing test** — append to `server/test/analytics.test.js` inside the existing `describe`:

```js
  it('counts service money as revenue but not as profit', async () => {
    const svc = await request(app).post('/api/services').send({ name_en: 'Recharge', name_ar: 'شحن', fields: [] });
    const before = await request(app).get('/api/analytics');
    const profitBefore = before.body.totals.profit;
    const servicesBefore = before.body.totals.services;

    await request(app)
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 250 });

    const after = await request(app).get('/api/analytics');
    expect(after.body.totals.services).toBe(servicesBefore + 250); // revenue counted
    expect(after.body.totals.profit).toBe(profitBefore); // profit unchanged
  });
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/test/analytics.test.js` → Expected: FAIL (current code does `totals.profit += r.profit` for service; with profit=0 it actually passes the profit check, but the test also guards the design — if a legacy service row has profit>0 it would fail. Treat this step as locking the intended behavior; if it already passes, proceed — the code change below makes the intent explicit and covers the trend.)

- [ ] **Step 3: Make service revenue-only in `analytics.js`** — in the totals loop, change the `service` branch to drop the profit line:

```js
    } else if (r.type === 'service') {
      totals.services += r.total;
    }
```

- [ ] **Step 4: Make the trend product-sales only** — replace the trend SQL's `CASE WHEN type IN ('sale','service')` (both the `sales` and `profit` expressions) with `type = 'sale'`:

```js
      `SELECT strftime('${fmt}', created_at) AS bucket,
              COALESCE(SUM(CASE WHEN type = 'sale' THEN total ELSE 0 END), 0) AS sales,
              COALESCE(SUM(CASE WHEN type = 'sale' THEN profit ELSE 0 END), 0) AS profit
       FROM transactions ${whereSql}
       GROUP BY bucket ORDER BY bucket`,
```

- [ ] **Step 5: Run it** — `npx vitest run server/test/analytics.test.js` → Expected: PASS (all analytics tests).

- [ ] **Step 6: Commit**

```bash
git add server/repositories/analytics.js server/test/analytics.test.js
git commit -m "feat(services): analytics counts service money as revenue, not profit"
```

---

### Task 7: Seed the new services data; stop seeding legacy service types

**Files:**
- Modify: `server/db/seed.js`
- Test: `server/test/services.test.js` (extend)

**Interfaces:**
- Consumes: `option_lists`, `services`, `service_shortcuts` tables.
- Produces: on a fresh DB, a `Providers` option list, services `Top-up`/`Bill Payment`/`Maintenance`, and a few shortcuts. `SERVICE_TYPES` is no longer inserted.

- [ ] **Step 1: Write the failing test** — append to `server/test/services.test.js`:

```js
  it('seeds default services and a Providers option list', async () => {
    const services = await request(app).get('/api/services');
    expect(services.body.map((s) => s.name_en)).toEqual(expect.arrayContaining(['Top-up', 'Bill Payment', 'Maintenance']));

    const lists = await request(app).get('/api/option-lists');
    const providers = lists.body.find((l) => l.name_en === 'Providers');
    expect(providers).toBeDefined();
    expect(providers.options).toEqual(expect.arrayContaining(['Vodafone', 'WE', 'Orange', 'E&']));

    const shortcuts = await request(app).get('/api/service-shortcuts');
    expect(shortcuts.body.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/test/services.test.js` → Expected: FAIL (no seeded services/lists/shortcuts).

- [ ] **Step 3: Update `server/db/seed.js`** — remove the `SERVICE_TYPES` constant and its `seedTable('service_types', ...)` call. After the existing `seedTable('brands', ...)` / `ensureProtected(...)` block and before the settings-row block, add a services seeding block:

```js
  // Services module seed (new model). Idempotent: only when there are no services yet.
  if (db.prepare('SELECT COUNT(*) AS c FROM services').get().c === 0) {
    const providers = db
      .prepare('INSERT INTO option_lists (name_en, name_ar, options) VALUES (?, ?, ?)')
      .run('Providers', 'المزودون', JSON.stringify(['Vodafone', 'WE', 'Orange', 'E&']));
    const providersId = providers.lastInsertRowid;

    const insertService = db.prepare(
      'INSERT INTO services (name_en, name_ar, fields, sort_order) VALUES (?, ?, ?, ?)',
    );
    const topupId = insertService.run(
      'Top-up',
      'شحن',
      JSON.stringify([
        { key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'select', required: true, option_list_id: providersId },
        { key: 'type', label_en: 'Type', label_ar: 'النوع', type: 'select', required: true, options: ['شحن', 'كارت فكة', 'أخرى'] },
      ]),
      1,
    ).lastInsertRowid;
    insertService.run(
      'Bill Payment',
      'دفع فواتير',
      JSON.stringify([
        { key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'select', required: false, option_list_id: providersId },
      ]),
      2,
    );
    insertService.run('Maintenance', 'صيانة', JSON.stringify([]), 3);

    const insertShortcut = db.prepare(
      'INSERT INTO service_shortcuts (service_id, label_en, label_ar, color, sort_order, preset_values) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertShortcut.run(topupId, 'Vodafone شحن', 'فودافون شحن', 'red', 1, JSON.stringify({ provider: 'Vodafone', type: 'شحن' }));
    insertShortcut.run(topupId, 'Orange شحن', 'أورنج شحن', 'orange', 2, JSON.stringify({ provider: 'Orange', type: 'شحن' }));
    insertShortcut.run(topupId, 'WE شحن', 'وي شحن', 'grape', 3, JSON.stringify({ provider: 'WE', type: 'شحن' }));
  }
```

- [ ] **Step 4: Run it** — `npx vitest run server/test/services.test.js` → Expected: PASS.

- [ ] **Step 5: Run the full suite** — `npm test` → Expected: PASS (all suites green).

- [ ] **Step 6: Commit**

```bash
git add server/db/seed.js server/test/services.test.js
git commit -m "feat(services): seed default services, Providers list, and starter shortcuts"
```

---

## Self-Review

**Spec coverage:**
- Data model (services/option_lists/service_shortcuts, transaction snapshot) → Tasks 1–4, 5. ✔
- Pure-revenue recording (total=cost, profit=0, snapshot) → Task 5. ✔
- Shared option lists + inline options → Task 2 (lists) + Task 3 field schema (`option_list_id` XOR `options`). ✔
- Analytics: Service Revenue as its own figure, not profit → Task 6. ✔
- Migration (new tables + columns, idempotent) → Task 1. ✔
- Seed new services / stop legacy seeding → Task 7. ✔
- Field types strict set (text/number/select) + required validation → Task 3 + Task 5. ✔

**Out of scope for Phase 1 (separate plans, see below):** all client/UI work, dashboard KPI display, removing the New Transaction service tab, i18n strings. The legacy `service_types` table/routes are intentionally left in place for historical rows.

**Type consistency:** repos all expose `{ list, getById, create, update, remove }`; `services.getById().fields` is an array of `{key,label_en,label_ar,type,required,option_list_id?|options?}`, consumed identically by Task 5's `createServiceTransaction`. Service payload keys (`service_id`, `cost`, `field_values`, `shortcut_id`) match between Task 5's helper, its tests, and Task 6's tests.

**Placeholder scan:** none — every step has concrete code/commands.

---

## Subsequent plans (to be written after Phase 1 merges)

These are deliberately separate so each is planned against the real, working backend (avoids speculative UI drift). Each produces working, testable software:

- **Phase 2 — Management UI:** services + fields editor; option-lists section added to `ManageLists.jsx`; shortcuts editor. New `api/` modules for services/option-lists/shortcuts.
- **Phase 3 — Recording UI:** Services page becomes the shortcut-card record hub (tap card → pre-filled modal → save); remove the service tab from `NewTransaction.jsx`; `api/transactions` service payload.
- **Phase 4 — Dashboard + i18n:** Service Revenue KPI on `Dashboard.jsx`; all `en.json`/`ar.json` strings; final polish + RTL check.

## Verification (end of Phase 1)

- `npm test` → all suites pass (new: option lists, services, shortcuts, service recording, analytics service-revenue; migration check).
- Migration sanity: Task 1 Step 6 confirms columns are added to a pre-existing DB.
- Manual API smoke (optional): `npm run dev`, then `POST /api/services`, `POST /api/service-shortcuts`, `POST /api/transactions {type:'service',...}`, `GET /api/analytics` to see `totals.services` rise without `totals.profit` changing.
