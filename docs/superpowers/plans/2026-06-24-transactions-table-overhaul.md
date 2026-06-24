# Transactions Table Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the transactions history section on the Manage Transactions page with a compact single-panel layout, items-summary column, username column, and quick period + username filters.

**Architecture:** Backend gains `user_id` + `username_snapshot` columns on the `transactions` table (via idempotent migration) and the `create()` repository function accepts the acting user. The frontend history section is restructured into one `Paper` with a dark header bar, compact filter row, and updated table columns.

**Tech Stack:** Node.js/Express + better-sqlite3 (backend), React + Mantine v7 + react-i18next (frontend), Vitest + Supertest (tests).

## Global Constraints

- ESM everywhere — use `.js` extensions in imports.
- Never hardcode UI strings — every new string goes into both `en.json` and `ar.json`.
- DB access via `getDb()` only; wrap multi-step writes in `db.transaction()`.
- Money stored as plain numbers; format for display via `client/src/lib/format.js`.
- Run `npm test` from the repo root to execute the backend suite; it must stay green.

---

## File Map

| File | What changes |
|------|-------------|
| `client/src/i18n/en.json` | Add 8 new `txns.*` keys |
| `client/src/i18n/ar.json` | Add 8 new `txns.*` keys (Arabic) |
| `server/db/schema.sql` | Add `user_id` + `username_snapshot` to `transactions` table |
| `server/db/migrate.js` | Idempotent column additions in `applyColumnMigrations` |
| `server/repositories/transactions.js` | `create()` accepts `user`; `list()` adds username filter |
| `server/routes/transactions.js` | Pass `req.user` to `create()` |
| `server/test/transactions.test.js` | Add tests for username storage + filtering |
| `client/src/api/transactions.js` | Pass `username` param in `listTransactions` |
| `client/src/pages/NewTransaction.jsx` | Full history-section redesign |

---

## Task 1: i18n keys

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`

**Interfaces:**
- Produces: translation keys `txns.itemCount`, `txns.user`, `txns.filterUser`, `txns.quickToday`, `txns.quickWeek`, `txns.quickMonth`, `txns.quickYear`, `txns.clearFilters` — used by Task 4.

- [ ] **Step 1: Add keys to `en.json`**

In `client/src/i18n/en.json`, find the `"txns"` object (currently ends at `"to": "To"`) and add the new keys:

```json
"txns": {
  "title": "Transactions",
  "filterType": "Type",
  "date": "Date",
  "items": "Items",
  "itemCount": "#",
  "total": "Total",
  "profit": "Profit",
  "note": "Note",
  "details": "Transaction Details",
  "from": "From",
  "to": "To",
  "user": "User",
  "filterUser": "User",
  "quickToday": "Today",
  "quickWeek": "This Week",
  "quickMonth": "This Month",
  "quickYear": "This Year",
  "clearFilters": "Clear"
},
```

- [ ] **Step 2: Add keys to `ar.json`**

In `client/src/i18n/ar.json`, find the `"txns"` object and add:

```json
"txns": {
  "title": "المعاملات",
  "filterType": "النوع",
  "date": "التاريخ",
  "items": "العناصر",
  "itemCount": "#",
  "total": "الإجمالي",
  "profit": "الربح",
  "note": "ملاحظة",
  "details": "تفاصيل المعاملة",
  "from": "من",
  "to": "إلى",
  "user": "المستخدم",
  "filterUser": "المستخدم",
  "quickToday": "اليوم",
  "quickWeek": "هذا الأسبوع",
  "quickMonth": "هذا الشهر",
  "quickYear": "هذه السنة",
  "clearFilters": "مسح"
},
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/en.json client/src/i18n/ar.json
git commit -m "feat(i18n): add transaction table overhaul keys"
```

---

## Task 2: Schema migration — add username columns to transactions

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/db/migrate.js`

**Interfaces:**
- Produces: `transactions.user_id` (nullable FK) and `transactions.username_snapshot` (nullable TEXT) — used by Tasks 3 and 4.

- [ ] **Step 1: Update `schema.sql`**

In `server/db/schema.sql`, find the `CREATE TABLE IF NOT EXISTS transactions` block and add the two new columns before the closing `);`. The full table definition becomes:

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL CHECK (type IN ('purchase','sale','service')),
  service_type_id INTEGER REFERENCES service_types(id) ON DELETE SET NULL,
  service_id      INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_data    TEXT,
  note            TEXT,
  subtotal        REAL NOT NULL DEFAULT 0,
  fee             REAL NOT NULL DEFAULT 0,
  cost_total      REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  profit          REAL NOT NULL DEFAULT 0,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username_snapshot TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Add column migrations to `migrate.js`**

In `server/db/migrate.js`, inside `applyColumnMigrations(db)`, add after the existing `txnCols` block (the one that adds `service_id` and `service_data`):

```js
  if (!txnCols.includes('user_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!txnCols.includes('username_snapshot')) {
    db.exec('ALTER TABLE transactions ADD COLUMN username_snapshot TEXT');
  }
```

The full updated `txnCols` block now reads:

```js
  // Transactions: service redesign columns.
  const txnCols = columns('transactions');
  if (!txnCols.includes('service_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE SET NULL');
  }
  if (!txnCols.includes('service_data')) {
    db.exec('ALTER TABLE transactions ADD COLUMN service_data TEXT');
  }
  if (!txnCols.includes('user_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!txnCols.includes('username_snapshot')) {
    db.exec('ALTER TABLE transactions ADD COLUMN username_snapshot TEXT');
  }
```

- [ ] **Step 3: Verify migration runs without error**

```bash
npm run seed
```

Expected: completes without error. Existing `store.db` (if present) gains the columns; new databases include them from `schema.sql`.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.sql server/db/migrate.js
git commit -m "feat(db): add user_id and username_snapshot to transactions"
```

---

## Task 3: Repository + route — store and filter by username

**Files:**
- Modify: `server/repositories/transactions.js`
- Modify: `server/routes/transactions.js`
- Modify: `server/test/transactions.test.js`

**Interfaces:**
- Consumes: `transactions.user_id`, `transactions.username_snapshot` columns from Task 2.
- Produces:
  - `transactions.create(payload, user)` — `user` is `{ id: number, username: string } | undefined`
  - `transactions.list(query)` — accepts optional `query.username: string`; each returned item now includes `username_snapshot`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `server/test/transactions.test.js` (before the closing `}`):

```js
  it('stores username_snapshot when a user is present on the JWT', async () => {
    const p = await createProduct({ name: 'SnapPhone', buying_price: 200, selling_price: 300, quantity: 3 });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] });
    expect(res.status).toBe(201);
    // The seeded owner token is injected by the test helper — username must be present.
    expect(typeof res.body.username_snapshot).toBe('string');
    expect(res.body.username_snapshot.length).toBeGreaterThan(0);
  });

  it('filters by username_snapshot', async () => {
    const p = await createProduct({ name: 'FilterPhone', buying_price: 100, selling_price: 150, quantity: 5 });
    await api.post('/api/transactions').send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] });

    // The seeded owner's username is the authenticated user for all api calls in this suite.
    const ownerUsername = (await api.get('/api/users')).body[0]?.username;
    expect(ownerUsername).toBeTruthy();

    const filtered = await api.get('/api/transactions').query({ username: ownerUsername });
    expect(filtered.body.items.every((t) => t.username_snapshot === ownerUsername)).toBe(true);

    const noMatch = await api.get('/api/transactions').query({ username: '__nobody__' });
    expect(noMatch.body.items.length).toBe(0);
  });
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "username_snapshot\|filterPhone"
```

Expected: both new tests fail (username_snapshot is `null`; filter returns wrong rows).

- [ ] **Step 3: Update `createServiceTransaction` in `transactions.js`**

Change the function signature and the INSERT to accept `user`:

```js
function createServiceTransaction(payload, user) {
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
      `INSERT INTO transactions
         (type, service_id, service_data, note, subtotal, fee, cost_total, total, profit, user_id, username_snapshot)
       VALUES ('service', @service_id, @service_data, @note, 0, 0, 0, @total, 0, @user_id, @username_snapshot)`,
    )
    .run({
      service_id: service.id,
      service_data: serviceData,
      note: payload.note || null,
      total: cost,
      user_id: user?.id ?? null,
      username_snapshot: user?.username ?? null,
    });
  return getById(info.lastInsertRowid);
}
```

- [ ] **Step 4: Update `create` in `transactions.js`**

Change the function signature to `export function create(payload, user)` and update the call to `createServiceTransaction` and the main INSERT:

```js
export function create(payload, user) {
  const type = payload.type;
  if (!['purchase', 'sale', 'service'].includes(type)) {
    const err = new Error('Invalid transaction type');
    err.status = 400;
    throw err;
  }
  if (type === 'service') return createServiceTransaction(payload, user);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const fee = type === 'service' ? round2(payload.fee) : 0;

  if (rawItems.length === 0 && type !== 'service') {
    const err = new Error('Transaction must have at least one item');
    err.status = 400;
    throw err;
  }

  const db = getDb();
  const run = db.transaction(() => {
    const txnInfo = db
      .prepare(
        `INSERT INTO transactions
           (type, service_type_id, note, subtotal, fee, cost_total, total, profit, user_id, username_snapshot)
         VALUES (@type, @service_type_id, @note, 0, @fee, 0, 0, 0, @user_id, @username_snapshot)`,
      )
      .run({
        type,
        service_type_id: payload.service_type_id || null,
        note: payload.note || null,
        fee,
        user_id: user?.id ?? null,
        username_snapshot: user?.username ?? null,
      });
    const transactionId = txnInfo.lastInsertRowid;

    const itemStmt = db.prepare(
      `INSERT INTO transaction_items
       (transaction_id, product_id, name_snapshot, quantity, unit_price, unit_cost, line_total)
       VALUES (@transaction_id, @product_id, @name_snapshot, @quantity, @unit_price, @unit_cost, @line_total)`,
    );

    let subtotal = 0;
    let costTotal = 0;

    for (const item of rawItems) {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const { product } = resolveProduct(item);

      const unitPrice = round2(item.unit_price ?? product?.selling_price ?? 0);
      const unitCost =
        item.unit_cost != null
          ? round2(item.unit_cost)
          : type === 'purchase'
            ? unitPrice
            : round2(product?.buying_price ?? 0);
      const lineTotal = round2(unitPrice * quantity);

      itemStmt.run({
        transaction_id: transactionId,
        product_id: product?.id ?? null,
        name_snapshot: product?.name ?? item.name ?? 'Unregistered item',
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_total: lineTotal,
      });

      subtotal += lineTotal;
      costTotal += round2(unitCost * quantity);

      if (product) {
        if (type === 'purchase') {
          products.adjustQuantity(product.id, quantity);
        } else {
          products.adjustQuantity(product.id, -quantity);
        }
      }
    }

    subtotal = round2(subtotal);
    costTotal = round2(costTotal);

    let total;
    let profit;
    if (type === 'purchase') {
      total = subtotal;
      profit = 0;
    } else if (type === 'service') {
      total = round2(subtotal + fee);
      profit = round2(total - costTotal);
    } else {
      total = subtotal;
      profit = round2(total - costTotal);
    }

    db.prepare(
      `UPDATE transactions SET subtotal = ?, cost_total = ?, total = ?, profit = ? WHERE id = ?`,
    ).run(subtotal, costTotal, total, profit, transactionId);

    return transactionId;
  });

  const id = run();
  return getById(id);
}
```

- [ ] **Step 5: Update `list` in `transactions.js` — add username filter**

In the `list` function, add the `username` filter clause after the `to` clause:

```js
export function list(query = {}) {
  const where = [];
  const params = {};
  if (query.type) {
    where.push('type = @type');
    params.type = query.type;
  }
  if (query.from) {
    where.push('created_at >= @from');
    params.from = query.from;
  }
  if (query.to) {
    where.push('created_at <= @to');
    params.to = query.to;
  }
  if (query.username) {
    where.push('username_snapshot = @username');
    params.username = query.username;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const total = getDb().prepare(`SELECT COUNT(*) AS c FROM transactions ${whereSql}`).get(params).c;
  const rows = getDb()
    .prepare(`SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset });

  const itemsStmt = getDb().prepare('SELECT * FROM transaction_items WHERE transaction_id = ?');
  const items = rows.map((t) => ({ ...t, items: itemsStmt.all(t.id) }));

  return { items, total, page, pageSize };
}
```

(`SELECT *` already returns `username_snapshot` — no change to the SELECT clause needed.)

- [ ] **Step 6: Update route to pass `req.user`**

Replace the `router.post('/')` handler in `server/routes/transactions.js`:

```js
router.post('/', (req, res) => {
  const result = transactions.create(req.body, req.user);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'record_transaction', entity: 'transaction', entityId: result.id, detail: { type: result.type } });
  res.status(201).json(result);
});
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
npm test
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 8: Commit**

```bash
git add server/repositories/transactions.js server/routes/transactions.js server/test/transactions.test.js
git commit -m "feat(transactions): store username; add username filter to list"
```

---

## Task 4: Frontend — API client + history section redesign

**Files:**
- Modify: `client/src/api/transactions.js`
- Modify: `client/src/pages/NewTransaction.jsx`

**Interfaces:**
- Consumes:
  - i18n keys from Task 1: `txns.itemCount`, `txns.user`, `txns.filterUser`, `txns.quickToday`, `txns.quickWeek`, `txns.quickMonth`, `txns.quickYear`, `txns.clearFilters`
  - `txn.username_snapshot` from Task 3
  - `listUsers()` from `client/src/api/users.js` (already exists)

- [ ] **Step 1: Update `listTransactions` to pass `username` param**

Replace `client/src/api/transactions.js` entirely:

```js
import api from './client.js';

export async function listTransactions(params) {
  const { data } = await api.get('/transactions', { params });
  return data;
}

export async function getTransaction(id) {
  const { data } = await api.get(`/transactions/${id}`);
  return data;
}

export async function createTransaction(body) {
  const { data } = await api.post('/transactions', body);
  return data;
}
```

No change needed — `params` is passed as-is to axios, and `username` will be included automatically when it is in the query object.

- [ ] **Step 2: Rewrite the history section in `NewTransaction.jsx`**

Replace the entire file. The key changes are:
- Add `Box`, `useMantineColorScheme` import from `@mantine/core`
- Add `listUsers` import from `../api/users.js`
- Add `filterUser`, `users`, `quickPeriod` state
- Add `itemSummary` helper and `applyQuickPeriod` helper
- Replace the two separate Papers + detached Pagination with one Paper
- Update `historyQuery` to include `username`
- Update `useEffect` page-reset to also watch `filterUser`

Full replacement of `client/src/pages/NewTransaction.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Title,
  Stack,
  Group,
  SegmentedControl,
  Paper,
  Box,
  Table,
  NumberInput,
  TextInput,
  Button,
  ActionIcon,
  Text,
  Badge,
  Center,
  Divider,
  Textarea,
  Select,
  Pagination,
  Modal,
  ScrollArea,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconDeviceFloppy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import ProductSearchInput from '../components/ProductSearchInput.jsx';
import { lookupByBarcode, searchProducts } from '../api/products.js';
import { listTransactions, getTransaction, createTransaction } from '../api/transactions.js';
import { listUsers } from '../api/users.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import ServiceRecorder from '../components/ServiceRecorder.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 20;
const MAX_SHOWN = 2;
const typeColor = (type) => (type === 'sale' ? 'blue' : type === 'purchase' ? 'teal' : 'grape');

let lineCounter = 0;
const nextKey = () => `line-${lineCounter++}`;

function itemSummary(items = []) {
  const names = items.map((i) => i.name_snapshot);
  if (names.length === 0) return '—';
  if (names.length <= MAX_SHOWN) return names.join(', ');
  return `${names.slice(0, MAX_SHOWN).join(', ')} +${names.length - MAX_SHOWN}`;
}

function quickRange(preset) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    // Week starts on Saturday (getDay: 0=Sun, 6=Sat)
    const daysSinceSat = (now.getDay() + 1) % 7;
    const sat = new Date(now);
    sat.setDate(now.getDate() - daysSinceSat);
    return { from: sat.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: first.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'year') {
    const first = new Date(now.getFullYear(), 0, 1);
    return { from: first.toISOString().slice(0, 10), to: today };
  }
  return { from: '', to: '' };
}

export default function NewTransaction() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { isAdmin } = useAuth();
  const { colorScheme } = useMantineColorScheme();

  // --- New transaction form ---
  const [type, setType] = useState('sale');
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Transaction history ---
  const [filterType, setFilterType] = useState(null);
  const [filterUser, setFilterUser] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quickPeriod, setQuickPeriod] = useState(null);
  const [page, setPage] = useState(1);
  const [historyData, setHistoryData] = useState({ items: [], total: 0 });
  const [refresh, setRefresh] = useState(0);
  const [users, setUsers] = useState([]);

  const [detail, setDetail] = useState(null);
  const [opened, handlers] = useDisclosure(false);

  const [searchResults, setSearchResults] = useState([]);
  const [pickerOpened, pickerHandlers] = useDisclosure(false);

  const barcodeRef = useRef(null);
  const anyModalOpen = opened || pickerOpened;
  const anyModalOpenRef = useRef(anyModalOpen);
  anyModalOpenRef.current = anyModalOpen;
  const detailPending = useRef(false);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    const refocusIfIdle = () => {
      setTimeout(() => {
        if (anyModalOpenRef.current || detailPending.current) return;
        const active = document.activeElement;
        if (!active || active === document.body) {
          barcodeRef.current?.focus();
        }
      }, 50);
    };
    document.addEventListener('focusout', refocusIfIdle);
    return () => document.removeEventListener('focusout', refocusIfIdle);
  }, []);

  const prevModalOpen = useRef(anyModalOpen);
  useEffect(() => {
    if (prevModalOpen.current && !anyModalOpen) {
      setTimeout(() => barcodeRef.current?.focus(), 0);
    }
    prevModalOpen.current = anyModalOpen;
  }, [anyModalOpen]);

  // Load users list for the username filter (admin only)
  useEffect(() => {
    if (isAdmin) {
      listUsers().then(setUsers).catch(() => {});
    }
  }, [isAdmin]);

  const historyQuery = useMemo(
    () => ({
      type: filterType || undefined,
      username: filterUser || undefined,
      from: from || undefined,
      to: to ? `${to} 23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [filterType, filterUser, from, to, page],
  );

  useEffect(() => {
    listTransactions(historyQuery).then(setHistoryData).catch(() => {});
  }, [historyQuery, refresh]);

  useEffect(() => {
    setPage(1);
  }, [filterType, filterUser, from, to]);

  const applyQuickPeriod = (preset) => {
    const { from: f, to: tt } = quickRange(preset);
    setFrom(f);
    setTo(tt);
    setQuickPeriod(preset);
  };

  const clearFilters = () => {
    setFilterType(null);
    setFilterUser(null);
    setFrom('');
    setTo('');
    setQuickPeriod(null);
  };

  const openDetail = async (id) => {
    try {
      const txn = await getTransaction(id);
      setDetail(txn);
      handlers.open();
    } finally {
      detailPending.current = false;
    }
  };

  const totalPages = Math.max(1, Math.ceil(historyData.total / PAGE_SIZE));

  // --- Form logic ---
  const priceFor = (product) => (type === 'purchase' ? product.buying_price : product.selling_price);

  const addLine = (line) => setLines((prev) => [...prev, { key: nextKey(), ...line }]);

  const addProductLine = (product) => {
    const unitPrice = priceFor(product);
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product_id === product.id ? { ...l, quantity: (Number(l.quantity) || 0) + 1 } : l
        );
      }
      return [
        ...prev,
        {
          key: nextKey(),
          product_id: product.id,
          name: product.name,
          barcode: product.barcode,
          quantity: 1,
          unit_price: unitPrice,
          unit_cost: product.buying_price,
          stock: product.quantity,
          locked: true,
        },
      ];
    });
  };

  const handleScan = async (code) => {
    const byBarcode = await lookupByBarcode(code).catch(() => null);
    if (byBarcode) { addProductLine(byBarcode); return; }

    const results = await searchProducts(code).catch(() => []);
    if (results.length === 1) {
      addProductLine(results[0]);
    } else if (results.length > 1) {
      setSearchResults(results);
      pickerHandlers.open();
    } else {
      notifications.show({ message: t('newTxn.productNotFound'), color: 'red' });
    }
  };

  const addManualLine = () =>
    addLine({ product_id: null, name: '', barcode: null, quantity: 1, unit_price: 0, unit_cost: 0, locked: false });

  const updateLine = (key, patch) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    const cost = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
    const total = subtotal;
    const profit = type === 'purchase' ? 0 : total - cost;
    return { subtotal, total, profit };
  }, [lines, type]);

  const canSubmit =
    !saving &&
    lines.length > 0 &&
    lines.every((l) => {
      if (!l.product_id && !(l.name && l.name.trim())) return false;
      if (type === 'sale' && l.stock != null && Number(l.quantity) > l.stock) return false;
      return true;
    });

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        type,
        note: note || undefined,
        items: lines.map((l) => ({
          product_id: l.product_id || undefined,
          barcode: l.barcode || undefined,
          name: l.name || undefined,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
          unit_cost: Number(l.unit_cost) || 0,
        })),
      };
      await createTransaction(payload);
      notifications.show({ message: t('newTxn.recorded'), color: 'green' });
      setLines([]);
      setNote('');
      setPage(1);
      setRefresh((r) => r + 1);
    } catch (err) {
      notifications.show({ message: err.response?.data?.error || t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const headerBg = colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-1)';
  const headerBorder = colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)';

  const userSelectData = users.map((u) => ({
    value: u.username,
    label: u.display_name ? `${u.display_name} (${u.username})` : u.username,
  }));

  return (
    <Stack>
      <Title order={2}>{t('newTxn.title')}</Title>

      <ServiceRecorder />

      <SegmentedControl
        value={type}
        onChange={(v) => {
          setType(v);
          setLines([]);
        }}
        data={[
          { value: 'sale', label: t('txnType.sale') },
          { value: 'purchase', label: t('txnType.purchase') },
        ]}
      />

      <Paper withBorder p="md" radius="md">
        <Group align="flex-end" mb="sm">
          <ProductSearchInput
            ref={barcodeRef}
            onScan={handleScan}
            onProductSelect={addProductLine}
            placeholder={t('newTxn.scanToAdd')}
            style={{ flex: 1 }}
          />
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={addManualLine}>
            {t('newTxn.manualAdd')}
          </Button>
        </Group>

        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('newTxn.item')}</Table.Th>
              <Table.Th w={90}>{t('newTxn.quantity')}</Table.Th>
              <Table.Th w={130}>{t('newTxn.unitPrice')}</Table.Th>
              <Table.Th w={120}>{t('newTxn.lineTotal')}</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l) => (
              <Table.Tr key={l.key}>
                <Table.Td>
                  {l.product_id ? (
                    <Stack gap={2}>
                      <Group gap={6}>
                        <Text fw={500}>{l.name}</Text>
                        {l.barcode && <Text size="xs" c="dimmed">{l.barcode}</Text>}
                      </Group>
                      {type === 'sale' && l.stock != null && (
                        <Text size="xs" c={Number(l.quantity) > l.stock ? 'red' : 'dimmed'}>
                          {t('newTxn.inStock')}: {formatNumber(l.stock, lang)}
                        </Text>
                      )}
                    </Stack>
                  ) : (
                    <TextInput
                      placeholder={t('newTxn.newItemName')}
                      value={l.name}
                      onChange={(e) => updateLine(l.key, { name: e.currentTarget.value })}
                    />
                  )}
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={1}
                    value={l.quantity}
                    onChange={(v) => updateLine(l.key, { quantity: v })}
                    hideControls
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    value={l.unit_price}
                    onChange={(v) => updateLine(l.key, { unit_price: v })}
                    hideControls
                  />
                </Table.Td>
                <Table.Td>{formatMoney((Number(l.quantity) || 0) * (Number(l.unit_price) || 0), lang)}</Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" color="red" onClick={() => removeLine(l.key)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            {lines.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Center p="md">
                    <Text c="dimmed">{t('newTxn.empty')}</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Textarea label={t('newTxn.note')} value={note} onChange={(e) => setNote(e.currentTarget.value)} mb="md" autosize minRows={1} />
        <Divider mb="sm" />
        <Group justify="space-between">
          <Stack gap={2}>
            <Text size="sm" c="dimmed">
              {t('newTxn.subtotal')}: {formatMoney(totals.subtotal, lang)}
            </Text>
            <Text fw={700}>
              {t('newTxn.total')}: {formatMoney(totals.total, lang)}
            </Text>
            {type !== 'purchase' && (
              <Badge color="teal" variant="light">
                {t('newTxn.profit')}: {formatMoney(totals.profit, lang)}
              </Badge>
            )}
          </Stack>
          <Button
            size="md"
            leftSection={<IconDeviceFloppy size={18} />}
            disabled={!canSubmit}
            loading={saving}
            onClick={submit}
          >
            {t('newTxn.record')}
          </Button>
        </Group>
      </Paper>

      {/* ── Transaction history ─────────────────────────────── */}
      <Divider mt="md" />
      <Paper withBorder radius="md" p={0}>
        {/* Header bar: title + quick period buttons */}
        <Box
          px="md"
          py="xs"
          style={{
            backgroundColor: headerBg,
            borderBottom: `1px solid ${headerBorder}`,
            borderRadius: 'var(--mantine-radius-md) var(--mantine-radius-md) 0 0',
          }}
        >
          <Group justify="space-between">
            <Group gap="xs">
              {['today', 'week', 'month', 'year'].map((preset) => (
                <Button
                  key={preset}
                  size="xs"
                  variant={quickPeriod === preset ? 'filled' : 'default'}
                  onClick={() => applyQuickPeriod(preset)}
                >
                  {t(`txns.quick${preset.charAt(0).toUpperCase()}${preset.slice(1)}`)}
                </Button>
              ))}
            </Group>
            <Text fw={600} size="sm">{t('txns.title')}</Text>
          </Group>
        </Box>

        {/* Filter row */}
        <Group px="md" py="xs" gap="sm" align="flex-end" wrap="wrap">
          <Select
            size="xs"
            label={t('txns.filterType')}
            placeholder={t('common.all')}
            data={[
              { value: 'sale', label: t('txnType.sale') },
              { value: 'purchase', label: t('txnType.purchase') },
              { value: 'service', label: t('txnType.service') },
            ]}
            value={filterType}
            onChange={setFilterType}
            clearable
            w={120}
          />
          {isAdmin && (
            <Select
              size="xs"
              label={t('txns.filterUser')}
              placeholder={t('common.all')}
              data={userSelectData}
              value={filterUser}
              onChange={setFilterUser}
              clearable
              searchable
              w={150}
            />
          )}
          <TextInput
            size="xs"
            label={t('txns.from')}
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.currentTarget.value); setQuickPeriod(null); }}
            w={140}
          />
          <TextInput
            size="xs"
            label={t('txns.to')}
            type="date"
            value={to}
            onChange={(e) => { setTo(e.currentTarget.value); setQuickPeriod(null); }}
            w={140}
          />
          <Button size="xs" variant="default" onClick={clearFilters} style={{ alignSelf: 'flex-end' }}>
            {t('txns.clearFilters')}
          </Button>
        </Group>

        {/* Table */}
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs" fz="xs" miw={760}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('txns.date')}</Table.Th>
                <Table.Th>{t('newTxn.type')}</Table.Th>
                <Table.Th>{t('txns.items')}</Table.Th>
                <Table.Th w={40}>{t('txns.itemCount')}</Table.Th>
                <Table.Th>{t('txns.total')}</Table.Th>
                <Table.Th>{t('txns.profit')}</Table.Th>
                <Table.Th>{t('txns.user')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {historyData.items.map((txn) => (
                <Table.Tr
                  key={txn.id}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={() => { detailPending.current = true; }}
                  onClick={() => openDetail(txn.id)}
                >
                  <Table.Td>{formatDate(txn.created_at, lang)}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={typeColor(txn.type)}>
                      {t(`txnType.${txn.type}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" lineClamp={1}>{itemSummary(txn.items)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{formatNumber(txn.items?.length ?? 0, lang)}</Text>
                  </Table.Td>
                  <Table.Td>{formatMoney(txn.total, lang)}</Table.Td>
                  <Table.Td>
                    {txn.type === 'purchase' ? '—' : formatMoney(txn.profit, lang)}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{txn.username_snapshot || '—'}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
              {historyData.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Center p="lg">
                      <Text c="dimmed">{t('common.noResults')}</Text>
                    </Center>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {/* Pagination */}
        <Group justify="flex-end" px="md" py="sm">
          <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
        </Group>
      </Paper>

      {/* Product picker modal */}
      <Modal opened={pickerOpened} onClose={pickerHandlers.close} title={t('newTxn.selectProduct')} size="sm">
        <Stack gap="xs">
          {searchResults.map((p) => (
            <Button
              key={p.id}
              variant="default"
              justify="space-between"
              fullWidth
              rightSection={
                <Text size="xs" c="dimmed">
                  {t('newTxn.inStock')}: {formatNumber(p.quantity, lang)}
                </Text>
              }
              onClick={() => { addProductLine(p); pickerHandlers.close(); }}
            >
              {p.name}
            </Button>
          ))}
        </Stack>
      </Modal>

      {/* Transaction detail modal */}
      <Modal opened={opened} onClose={handlers.close} title={t('txns.details')} size="lg">
        {detail && (
          <Stack>
            <Group>
              <Badge variant="light" color={typeColor(detail.type)}>
                {t(`txnType.${detail.type}`)}
              </Badge>
              <Text c="dimmed">{formatDate(detail.created_at, lang)}</Text>
              {detail.username_snapshot && (
                <Text size="sm" c="dimmed">{detail.username_snapshot}</Text>
              )}
            </Group>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('newTxn.item')}</Table.Th>
                  <Table.Th>{t('newTxn.quantity')}</Table.Th>
                  <Table.Th>{t('newTxn.unitPrice')}</Table.Th>
                  <Table.Th>{t('newTxn.lineTotal')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detail.items.map((it) => (
                  <Table.Tr key={it.id}>
                    <Table.Td>{it.name_snapshot}</Table.Td>
                    <Table.Td>{formatNumber(it.quantity, lang)}</Table.Td>
                    <Table.Td>{formatMoney(it.unit_price, lang)}</Table.Td>
                    <Table.Td>{formatMoney(it.line_total, lang)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Divider />
            <Group justify="space-between">
              <Stack gap={2}>
                {detail.type === 'service' && (
                  <Text size="sm" c="dimmed">
                    {t('newTxn.fee')}: {formatMoney(detail.fee, lang)}
                  </Text>
                )}
                <Text fw={700}>
                  {t('newTxn.total')}: {formatMoney(detail.total, lang)}
                </Text>
              </Stack>
              {detail.type !== 'purchase' && (
                <Badge color="teal" variant="light" size="lg">
                  {t('newTxn.profit')}: {formatMoney(detail.profit, lang)}
                </Badge>
              )}
            </Group>
            {detail.note && <Text c="dimmed">{detail.note}</Text>}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
```

- [ ] **Step 3: Run backend tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Manual UI verification**

Start the dev server:
```bash
npm run dev
```

Open http://localhost:5173/new-transaction and verify:

1. **Layout**: History section is a single bordered panel — header bar, filter row, table, pagination all inside one Paper. No separate filter Paper above.
2. **Header bar**: Has the darker background matching the rest of the app theme. Shows the title on the right. Shows "Today / This Week / This Month / This Year" buttons on the left (RTL: swapped sides).
3. **Quick filter — Today**: Click "Today". From and To date inputs both fill with today's date. Table filters. The "Today" button is highlighted.
4. **Quick filter — This Week**: Click "This Week". From date is the most recent Saturday. Verify by checking the day of week for the `from` date.
5. **Quick filter — This Month**: Click "This Month". From date is the 1st of the current month.
6. **Quick filter — This Year**: Click "This Year". From date is Jan 1 of the current year.
7. **Manual date edit clears quick highlight**: Change one date input manually → no quick button is highlighted.
8. **Clear button**: Click "Clear" → all filters reset, quick period deselected.
9. **Items column**: Shows comma-separated item names. For a transaction with 3+ items, shows "Name1, Name2 +N".
10. **# column**: Shows correct count of line items.
11. **User column**: After recording a new transaction, the user column shows the logged-in username.
12. **Username filter (admin)**: Admins see the User filter dropdown. Selecting a user filters the table.
13. **Username filter (staff)**: Log in as a staff user — the User filter is not visible.
14. **Detail modal**: Still works; shows username_snapshot in the header.
15. **Arabic**: Switch to Arabic — all new strings render in Arabic, RTL layout works.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/transactions.js client/src/pages/NewTransaction.jsx
git commit -m "feat(transactions): compact history panel, items summary, username column, quick filters"
```
