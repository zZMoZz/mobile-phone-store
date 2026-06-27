# Transaction Void Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-minute void window to transactions so staff can reverse a mistake — stock is automatically restored and the transaction disappears from the table.

**Architecture:** Soft delete via two new nullable columns (`voided_at`, `voided_by_id`) on `transactions`. A new `POST /api/transactions/:id/void` endpoint enforces the time window and atomically reverses stock. On the client, a Void button appears per row within the window, gated by a new `txn.void` capability.

**Tech Stack:** Node.js/Express + better-sqlite3 (sync), React + Mantine + react-i18next, Vitest + Supertest.

## Global Constraints

- ESM everywhere (`"type": "module"`), use `.js` extensions in all imports
- DB access via `getDb()` from `server/db/connection.js`; multi-step writes must use `db.transaction()`
- Money stored as plain numbers — no formatting in the backend
- i18n: never hardcode UI strings; add keys to both `en.json` and `ar.json`
- No new dependencies — all libraries already installed
- Permission gating: backend uses `requirePermission(cap)` middleware; frontend uses `useAuth().can(cap)`
- New capabilities must be added to **both** `permissions.js` files and given i18n labels (`permissions.caps.*`, with dots replaced by underscores)

---

## File Map

| File | Change |
|---|---|
| `server/db/schema.sql` | Add `voided_at` + `voided_by_id` to `CREATE TABLE transactions` |
| `server/db/migrate.js` | Add idempotent `ALTER TABLE` for existing DBs |
| `server/lib/permissions.js` | Add `'txn.void'` to `CAPABILITIES` |
| `client/src/lib/permissions.js` | Add `'txn.void'` to `CAPABILITY_GROUPS` (`do` group) |
| `client/src/i18n/en.json` | Add `permissions.caps.txn_void` + `txns.void.*` keys |
| `client/src/i18n/ar.json` | Same in Arabic |
| `server/repositories/transactions.js` | Add `voidTransaction(id, userId)`, update `list()` base WHERE |
| `server/routes/transactions.js` | Add `POST /:id/void` route |
| `client/src/api/transactions.js` | Add `voidTransaction(id)` API function |
| `client/src/pages/Transactions.jsx` | Add Void button, confirmation modal, error handling |
| `server/test/transactions.test.js` | Add void test cases |

---

## Task 1: DB Schema + Migration

**Files:**
- Modify: `server/db/schema.sql:73-88`
- Modify: `server/db/migrate.js:49-58` (inside the `applyColumnMigrations` function, in the `// Transactions: service redesign columns.` block)

- [ ] **Step 1: Add columns to schema.sql**

In `server/db/schema.sql`, find the `CREATE TABLE IF NOT EXISTS transactions` block (line 73). Add the two new columns **before** the closing `);`:

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL CHECK (type IN ('purchase','sale','service','return','expense')),
  service_type_id INTEGER REFERENCES service_types(id) ON DELETE SET NULL,
  service_id      INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_data    TEXT,                        -- JSON snapshot for service transactions
  note            TEXT,
  subtotal        REAL NOT NULL DEFAULT 0,     -- sum of item line totals
  fee             REAL NOT NULL DEFAULT 0,     -- service fee (service transactions)
  cost_total      REAL NOT NULL DEFAULT 0,     -- total cost of goods involved
  total           REAL NOT NULL DEFAULT 0,     -- amount charged/paid
  profit          REAL NOT NULL DEFAULT 0,     -- total - cost_total (sale/service)
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username_snapshot TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at       TEXT DEFAULT NULL,
  voided_by_id    INTEGER REFERENCES users(id) DEFAULT NULL
);
```

- [ ] **Step 2: Add migration for existing DBs in migrate.js**

In `server/db/migrate.js`, inside `applyColumnMigrations(db)`, **after** the existing `txnCols` block (the block ending around line 58 that adds `username_snapshot`), add:

```js
  if (!txnCols.includes('voided_at')) {
    db.exec('ALTER TABLE transactions ADD COLUMN voided_at TEXT DEFAULT NULL');
  }
  if (!txnCols.includes('voided_by_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN voided_by_id INTEGER REFERENCES users(id) DEFAULT NULL');
  }
```

Note: `txnCols` is already defined earlier in the same block as `columns('transactions')` — no re-declaration needed.

- [ ] **Step 3: Verify migration runs without error**

```bash
npm run seed
```

Expected: exits without error. The DB now has the two new columns.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.sql server/db/migrate.js
git commit -m "feat(void): add voided_at and voided_by_id columns to transactions"
```

---

## Task 2: Permissions + Capability i18n Labels

**Files:**
- Modify: `server/lib/permissions.js`
- Modify: `client/src/lib/permissions.js`
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`

- [ ] **Step 1: Add txn.void to server capabilities**

In `server/lib/permissions.js`, add `'txn.void'` to the `CAPABILITIES` array, directly after `'txn.return'`:

```js
export const CAPABILITIES = [
  // See (visibility)
  'see.cost',
  'see.others_transactions',
  'see.activity_log',
  // Do (actions)
  'txn.sale',
  'txn.service',
  'txn.expense',
  'txn.return',
  'txn.void',          // ← add here
  'inventory.view',
  'inventory.edit',
  'services.manage',
  'lists.manage',
  'settings.manage',
  'data.backup',
  'users.manage',
];
```

`PRESETS.admin` is `[...CAPABILITIES]` — it automatically includes `txn.void`. `PRESETS.staff` is an explicit list — it should NOT get `txn.void` (leave it unchanged). No other change needed in this file.

- [ ] **Step 2: Add txn.void to client capabilities**

In `client/src/lib/permissions.js`, add `'txn.void'` to the `do` group's `caps` array, after `'txn.return'`:

```js
export const CAPABILITY_GROUPS = [
  {
    group: 'see',
    caps: ['see.cost', 'see.others_transactions', 'see.activity_log'],
  },
  {
    group: 'do',
    caps: [
      'txn.sale',
      'txn.service',
      'txn.expense',
      'txn.return',
      'txn.void',          // ← add here
      'inventory.view',
      'inventory.edit',
      'services.manage',
      'lists.manage',
      'settings.manage',
      'data.backup',
      'users.manage',
    ],
  },
];
```

`PRESETS.admin` in this file is `[...CAPABILITIES]` (derived via flatMap) — it automatically includes `txn.void`. `PRESETS.staff` is explicit — leave it unchanged.

- [ ] **Step 3: Add capability label to en.json**

In `client/src/i18n/en.json`, find the `"permissions"` → `"caps"` object and add the new key after `"txn_return"`:

```json
"txn_void": "Void transactions (5-min window)"
```

- [ ] **Step 4: Add capability label to ar.json**

In `client/src/i18n/ar.json`, find the same `"caps"` object and add after `"txn_return"`:

```json
"txn_void": "إلغاء المعاملات (نافذة 5 دقائق)"
```

- [ ] **Step 5: Commit**

```bash
git add server/lib/permissions.js client/src/lib/permissions.js client/src/i18n/en.json client/src/i18n/ar.json
git commit -m "feat(void): add txn.void capability and i18n label"
```

---

## Task 3: Repository — voidTransaction + list filter (TDD)

**Files:**
- Modify: `server/test/transactions.test.js`
- Modify: `server/repositories/transactions.js`

### Step 1: Write the failing tests

- [ ] **Step 1a: Write void tests in transactions.test.js**

Append the following `describe` block to `server/test/transactions.test.js`:

```js
describe('voidTransaction', () => {
  let api;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ api, db, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  const createProduct = (body) =>
    api.post('/api/products').send({ category_id: 1, brand_id: 1, ...body }).then((r) => r.body);
  const getProduct = (id) => api.get(`/api/products/${id}`).then((r) => r.body);

  it('voiding a sale restores stock', async () => {
    const p = await createProduct({ name: 'VoidSaleTest', buying_price: 100, selling_price: 150, quantity: 5 });
    const sale = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 2 }] })
      .then((r) => r.body);

    const res = await api.post(`/api/transactions/${sale.id}/void`);
    expect(res.status).toBe(200);
    expect(res.body.voided_at).toBeTruthy();

    const after = await getProduct(p.id);
    expect(after.quantity).toBe(5); // restored to original
  });

  it('voiding a purchase removes the added stock', async () => {
    const p = await createProduct({ name: 'VoidPurchaseTest', buying_price: 50, selling_price: 80, quantity: 0 });
    const purchase = await api
      .post('/api/transactions')
      .send({ type: 'purchase', items: [{ product_id: p.id, quantity: 10, unit_price: 50 }] })
      .then((r) => r.body);

    const res = await api.post(`/api/transactions/${purchase.id}/void`);
    expect(res.status).toBe(200);

    const after = await getProduct(p.id);
    expect(after.quantity).toBe(0); // restored to 0
  });

  it('voiding a return removes the restocked quantity', async () => {
    const p = await createProduct({ name: 'VoidReturnTest', buying_price: 50, selling_price: 80, quantity: 5 });
    // Sell 2, then return 2 (qty back to 5)
    await api.post('/api/transactions').send({ type: 'sale', items: [{ product_id: p.id, quantity: 2 }] });
    const ret = await api
      .post('/api/transactions')
      .send({ type: 'return', items: [{ product_id: p.id, quantity: 2, unit_price: 80 }] })
      .then((r) => r.body);

    // Void the return → qty should drop back to 3
    const res = await api.post(`/api/transactions/${ret.id}/void`);
    expect(res.status).toBe(200);

    const after = await getProduct(p.id);
    expect(after.quantity).toBe(3);
  });

  it('returns 403 window_expired when more than 5 minutes have passed', async () => {
    const p = await createProduct({ name: 'VoidExpiredTest', buying_price: 50, selling_price: 80, quantity: 3 });
    const sale = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] })
      .then((r) => r.body);

    // Backdate created_at by 6 minutes using SQLite's datetime modifier
    db.prepare("UPDATE transactions SET created_at = datetime(created_at, '-6 minutes') WHERE id = ?").run(sale.id);

    const res = await api.post(`/api/transactions/${sale.id}/void`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('window_expired');
  });

  it('returns 409 insufficient_stock_to_void when stock was already sold', async () => {
    const p = await createProduct({ name: 'VoidConflictTest', buying_price: 50, selling_price: 80, quantity: 0 });
    const purchase = await api
      .post('/api/transactions')
      .send({ type: 'purchase', items: [{ product_id: p.id, quantity: 5, unit_price: 50 }] })
      .then((r) => r.body);

    // Sell all 5 units — stock is now 0
    await api.post('/api/transactions').send({ type: 'sale', items: [{ product_id: p.id, quantity: 5 }] });

    const res = await api.post(`/api/transactions/${purchase.id}/void`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('insufficient_stock_to_void');
    expect(res.body.params.products).toContain('VoidConflictTest');
  });

  it('returns 400 already_voided when voiding twice', async () => {
    const p = await createProduct({ name: 'VoidDoubleTest', buying_price: 50, selling_price: 80, quantity: 3 });
    const sale = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] })
      .then((r) => r.body);

    await api.post(`/api/transactions/${sale.id}/void`);
    const res = await api.post(`/api/transactions/${sale.id}/void`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('already_voided');
  });

  it('voided transactions do not appear in list()', async () => {
    const p = await createProduct({ name: 'VoidListTest', buying_price: 50, selling_price: 80, quantity: 3 });
    const sale = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] })
      .then((r) => r.body);

    const beforeVoid = await api.get('/api/transactions').then((r) => r.body);
    const hadIt = beforeVoid.items.some((t) => t.id === sale.id);
    expect(hadIt).toBe(true);

    await api.post(`/api/transactions/${sale.id}/void`);

    const afterVoid = await api.get('/api/transactions').then((r) => r.body);
    const stillHasIt = afterVoid.items.some((t) => t.id === sale.id);
    expect(stillHasIt).toBe(false);
  });
});
```

- [ ] **Step 1b: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A2 "voidTransaction"
```

Expected: All void tests fail — `POST /api/transactions/:id/void` returns 404 (route doesn't exist yet).

### Step 2: Implement voidTransaction in the repository

- [ ] **Step 2a: Add voidTransaction function to transactions.js**

In `server/repositories/transactions.js`, add the following export **after** the `getById` function (around line 81):

```js
export function voidTransaction(id, userId) {
  const db = getDb();

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!txn) {
    const err = new Error('Transaction not found');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }
  if (txn.voided_at) {
    const err = new Error('Transaction already voided');
    err.status = 400;
    err.code = 'already_voided';
    throw err;
  }

  const { age } = db.prepare("SELECT unixepoch('now') - unixepoch(?) AS age").get(txn.created_at);
  if (age > 300) {
    const err = new Error('Void window expired');
    err.status = 403;
    err.code = 'window_expired';
    throw err;
  }

  const items = db
    .prepare('SELECT product_id, quantity FROM transaction_items WHERE transaction_id = ?')
    .all(id);

  if (txn.type === 'purchase' || txn.type === 'return') {
    const conflicts = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const product = db.prepare('SELECT name, quantity FROM products WHERE id = ?').get(item.product_id);
      if (product && product.quantity < item.quantity) {
        conflicts.push(product.name);
      }
    }
    if (conflicts.length > 0) {
      const err = new Error('Insufficient stock to void');
      err.status = 409;
      err.code = 'insufficient_stock_to_void';
      err.params = { products: conflicts };
      throw err;
    }
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE transactions SET voided_at = datetime('now'), voided_by_id = ? WHERE id = ?",
    ).run(userId, id);

    for (const item of items) {
      if (!item.product_id) continue;
      let delta = 0;
      if (txn.type === 'purchase' || txn.type === 'return') {
        delta = -item.quantity; // undo the stock increase
      } else if (txn.type === 'sale') {
        delta = item.quantity; // restore sold stock
      }
      if (delta !== 0) {
        db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(delta, item.product_id);
      }
    }
  })();

  return getById(id);
}
```

- [ ] **Step 2b: Update list() to filter voided transactions**

In `server/repositories/transactions.js`, find the `list` function and the line:

```js
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
```

Replace it with:

```js
  const whereSql = `WHERE voided_at IS NULL${where.length ? ' AND ' + where.join(' AND ') : ''}`;
```

This ensures voided transactions are excluded from all list queries, aggregations, and counts.

- [ ] **Step 2c: Run tests (they will still fail — route not wired yet)**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "void|PASS|FAIL" | head -20
```

Expected: Still failing (404 from the missing route). The repository function now exists.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/transactions.js server/test/transactions.test.js
git commit -m "feat(void): add voidTransaction repository function and list filter"
```

---

## Task 4: Void Route + API Client

**Files:**
- Modify: `server/routes/transactions.js`
- Modify: `client/src/api/transactions.js`

- [ ] **Step 1: Add the void route**

In `server/routes/transactions.js`, add the import for `requirePermission` at the top (after the existing imports):

```js
import { requirePermission } from '../middleware/requirePermission.js';
```

Then add the void route **after** the existing `router.get('/:id', ...)` handler and **before** `export default router`:

```js
router.post('/:id/void', requirePermission('txn.void'), (req, res) => {
  const result = transactions.voidTransaction(Number(req.params.id), req.user.id);
  res.json(result);
});
```

- [ ] **Step 2: Run tests — all void tests should now pass**

```bash
npm test
```

Expected: All tests pass including the new void tests.

- [ ] **Step 3: Add voidTransaction to the client API module**

In `client/src/api/transactions.js`, add:

```js
export async function voidTransaction(id) {
  const { data } = await api.post(`/transactions/${id}/void`);
  return data;
}
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/transactions.js client/src/api/transactions.js
git commit -m "feat(void): wire void route and client API function"
```

---

## Task 5: Frontend — Void Button + Confirmation Modal

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`
- Modify: `client/src/pages/Transactions.jsx`

### Step 1: Add UI translation keys

- [ ] **Step 1a: Add void keys to en.json**

In `client/src/i18n/en.json`, find the `"txns"` object (there is a top-level key for transactions UI strings). Add a new `"void"` sub-object inside it:

```json
"void": {
  "button": "Void",
  "confirmTitle": "Void {{type}}?",
  "confirmBody": "This will reverse all stock effects. It cannot be undone.",
  "confirmAction": "Void",
  "errorExpired": "Too late — the 5-minute window has passed.",
  "errorStock": "Cannot void — stock for {{products}} has already been sold or used."
}
```

> **Where to put it:** Search `en.json` for the `"txns"` key. Add `"void"` as a sibling of existing keys like `"date"`, `"total"`, etc. within the `txns` object.

- [ ] **Step 1b: Add void keys to ar.json**

Find the matching `"txns"` object in `ar.json` and add:

```json
"void": {
  "button": "إلغاء",
  "confirmTitle": "إلغاء {{type}}؟",
  "confirmBody": "سيتم عكس جميع تأثيرات المخزون. لا يمكن التراجع عن هذا.",
  "confirmAction": "إلغاء",
  "errorExpired": "فات الوقت — انتهت نافذة 5 دقائق.",
  "errorStock": "لا يمكن الإلغاء — المخزون لـ {{products}} تم بيعه أو استخدامه بالفعل."
}
```

### Step 2: Update Transactions.jsx

- [ ] **Step 2a: Add new imports**

At the top of `client/src/pages/Transactions.jsx`, add `ActionIcon` and `Tooltip` to the Mantine import list, and add the icon import:

```js
// In the existing @mantine/core import, add ActionIcon and Tooltip:
import {
  // ... existing imports ...
  ActionIcon,
  Tooltip,
} from '@mantine/core';

// Add after the mantine/core import:
import { IconBan } from '@tabler/icons-react';
```

Also add `voidTransaction` to the API import:

```js
import { listTransactions, getTransaction, voidTransaction } from '../api/transactions.js';
```

- [ ] **Step 2b: Add void state variables**

Inside the `Transactions` component function, after the existing state declarations (around line 107 where `historyData` is declared), add:

```js
const [voidTarget, setVoidTarget] = useState(null); // { id, type }
const [voidOpened, { open: openVoid, close: closeVoid }] = useDisclosure(false);
const [voidLoading, setVoidLoading] = useState(false);
const [voidError, setVoidError] = useState(null);
const [refreshKey, setRefreshKey] = useState(0);
```

Then add `refreshKey` to the `historyQuery` useMemo dependency array (but NOT to the returned object — it's only there to trigger re-evaluation):

```js
const historyQuery = useMemo(
  () => ({
    // ... existing params unchanged ...
  }),
  [filterTypes, filterUser, filterServiceId, filterDirection, filterProduct, filterId, sortField, sortDir, from, to, page, refreshKey],
  //                                                                                                                       ↑ add this
);
```

- [ ] **Step 2c: Add void helper function**

Inside the component, add these two handlers:

```js
const isVoidable = (txn) =>
  Date.now() - new Date(txn.created_at + 'Z').getTime() < 5 * 60 * 1000;

const handleVoidClick = (e, txn) => {
  e.stopPropagation(); // prevent row click from opening detail modal
  setVoidTarget({ id: txn.id, type: txn.type });
  setVoidError(null);
  openVoid();
};

const handleVoidConfirm = async () => {
  if (!voidTarget) return;
  setVoidLoading(true);
  try {
    await voidTransaction(voidTarget.id);
    closeVoid();
    setVoidTarget(null);
    // Trigger list refetch by bumping refreshKey (historyQuery depends on it)
    setRefreshKey((k) => k + 1);
  } catch (err) {
    const code = err.response?.data?.code;
    const params = err.response?.data?.params;
    if (code === 'window_expired') {
      setVoidError(t('txns.void.errorExpired'));
    } else if (code === 'insufficient_stock_to_void') {
      setVoidError(t('txns.void.errorStock', { products: (params?.products ?? []).join(', ') }));
    } else {
      setVoidError(err.response?.data?.error || 'Error');
    }
  } finally {
    setVoidLoading(false);
  }
};
```

- [ ] **Step 2d: Add Actions column to the table header**

In the `<Table.Thead>` section, add a new `<Table.Th>` at the end (after the `note` column header). Keep it empty — it's the actions column:

```jsx
<Table.Th w={40} />
```

- [ ] **Step 2e: Add Void button to each table row**

Inside `historyData.items.map((txn) => ...)`, after the last `<Table.Td>` (the note column), add:

```jsx
<Table.Td onClick={(e) => e.stopPropagation()}>
  {can('txn.void') && isVoidable(txn) && (
    <ActionIcon
      color="red"
      variant="subtle"
      size="sm"
      title={t('txns.void.button')}
      onClick={(e) => handleVoidClick(e, txn)}
    >
      <IconBan size={16} />
    </ActionIcon>
  )}
</Table.Td>
```

- [ ] **Step 2f: Update the "no results" colSpan**

Find the `<Table.Td colSpan={10}>` in the empty-state row and change it to `colSpan={11}`.

- [ ] **Step 2g: Add the confirmation modal**

Add the following modal just before the existing detail modal (`{/* Transaction detail modal */}`):

```jsx
{/* Void confirmation modal */}
<Modal
  opened={voidOpened}
  onClose={closeVoid}
  title={t('txns.void.confirmTitle', { type: voidTarget ? t(`txnType.${voidTarget.type}`) : '' })}
  size="sm"
>
  <Stack gap="md">
    <Text>{t('txns.void.confirmBody')}</Text>
    {voidError && <Text c="red" size="sm">{voidError}</Text>}
    <Group justify="flex-end">
      <Button variant="default" onClick={closeVoid} disabled={voidLoading}>
        {t('common.cancel')}
      </Button>
      <Button color="red" onClick={handleVoidConfirm} loading={voidLoading}>
        {t('txns.void.confirmAction')}
      </Button>
    </Group>
  </Stack>
</Modal>
```

- [ ] **Step 3: Check that `can` is available**

The component already uses `useAuth()`. Confirm `can` is destructured from it (look for `const { ... } = useAuth()`). If `can` isn't already destructured, add it:

```js
const { can, user } = useAuth(); // or however useAuth is currently used in this component
```

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/en.json client/src/i18n/ar.json client/src/pages/Transactions.jsx
git commit -m "feat(void): add void button and confirmation modal to transactions table"
```

---

## Verification

Run end-to-end:

1. `npm run dev` — start the app
2. Log in as owner (has all capabilities)
3. Record a **sale** → the Void button (ban icon) appears in that row
4. Click Void → confirmation modal appears → confirm → row disappears, stock is restored (check inventory)
5. Record a **purchase** → void it → stock drops back to original
6. Record an **expense** → void it → row disappears, no stock change
7. Wait 6+ minutes after a transaction → Void button does not appear
8. Log in as a staff user without `txn.void` → no Void button on any row
9. Record a purchase of 5 units → sell all 5 → try to void the purchase → see "Cannot void — stock has already been sold" error in the modal

Run backend tests:

```bash
npm test
```

Expected: All tests pass, including the 6 new void tests.
