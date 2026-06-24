# Transactions Table Overhaul — Design Spec
_Date: 2026-06-24_

## Overview

Redesign the transaction history section on the Manage Transactions page (`NewTransaction.jsx`) to be more compact and information-dense: consolidate layout into a single panel, add an items-summary column, expose the recording user, and add quick period filters plus a username filter.

---

## 1. Interface Layout

### Before
Three separate elements: a filter `Paper`, a table `Paper`, and a detached `Pagination` row.

### After
One `Paper` containing everything:

```
┌──────────────────────────────────────────────────────────────┐
│ [dark header bar]  Transactions  │  Today  Week  Month  Year  │
├──────────────────────────────────────────────────────────────┤
│  Type ▾   User ▾   From [date]   To [date]   [Clear]         │
├──────────┬───────┬──────────────────┬─────┬────────┬─────────┤
│  Date    │ Type  │ Items            │  #  │ Total  │ User    │
├──────────┼───────┼──────────────────┼─────┼────────┼─────────┤
│  …       │ Sale  │ Vodafone, WE +1  │  3  │ 500    │ Ahmed   │
└──────────┴───────┴──────────────────┴─────┴────────┴─────────┘
                                             [ Pagination ]
```

- **Header bar**: full-width `Box` with `Table.Thead` background color. RTL-aware: title on the right, quick-period buttons on the left.
- **Filter row**: `Group` below the header with compact inputs (type select, user select, from date, to date, clear button).
- **Table**: `verticalSpacing="xs"`, `size="xs"` — compact.
- **Pagination**: rendered inside the Paper, right-aligned, below the table.
- **Note column**: removed from the summary row; still visible inside the detail modal.
- **Profit column**: retained, unchanged visibility.

---

## 2. Table Columns

| Order | Column | Source | Notes |
|-------|--------|---------|-------|
| 1 | Date | `txn.created_at` | Unchanged |
| 2 | Type | `txn.type` | Badge, unchanged |
| 3 | Items | `txn.items[].name_snapshot` | Summary string (see §2.1) |
| 4 | # | `txn.items.length` | Count of line items |
| 5 | Total | `txn.total` | Unchanged |
| 6 | Profit | `txn.profit` | Unchanged |
| 7 | User | `txn.username_snapshot` | New — see §4 |

### 2.1 Items Summary

```
MAX_SHOWN = 2
names = items.map(i => i.name_snapshot)
if names.length <= MAX_SHOWN → names.join(', ')
else                         → names.slice(0, MAX_SHOWN).join(', ') + ` +${names.length - MAX_SHOWN}`
```

Example: `"Vodafone, WE +1"` for 3 items.

---

## 3. Filtering

### 3.1 Existing filters (kept)
- **Type**: Select (All / Sale / Purchase / Service)
- **From / To**: date inputs

### 3.2 Quick period buttons (new)

Buttons: **Today · This Week · This Month · This Year**

Clicking a button sets `from` and `to`; the active button is highlighted. Manually editing either date input clears the active highlight.

| Button | `from` | `to` |
|--------|--------|------|
| Today | today's date | today's date |
| This Week | Saturday of the current week | today |
| This Month | 1st of the current calendar month | today |
| This Year | January 1st of the current year | today |

**"This Week" definition**: Saturday–Friday. Calculation:
```js
const day = now.getDay();         // 0 = Sun, 6 = Sat
const daysSinceSat = (day + 1) % 7;
const sat = new Date(now);
sat.setDate(now.getDate() - daysSinceSat);
```

### 3.3 Username filter (new)
- A `Select` populated on mount from `GET /api/users`.
- Value is a username string. Sends `username=<value>` to `GET /api/transactions`.
- Cleared by the Clear button alongside the other filters.
- Only admins can see the Users list; for staff the filter is hidden (they only record their own transactions).

---

## 4. Backend — Username Storage

### 4.1 Problem
The `transactions` table has no user information. `username_snapshot` is needed so the field remains meaningful even after a user is deleted (same pattern as `transaction_items.name_snapshot`).

### 4.2 Schema migration (`server/db/migrate.js`)

Add two columns idempotently inside `applyColumnMigrations`:

```sql
ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN username_snapshot TEXT;
```

Existing rows get `NULL` for both columns.

### 4.3 Repository (`server/repositories/transactions.js`)

**`create(payload, user)`**
- New second parameter `user = { id, username }`.
- Store `user.id` → `user_id` and `user.username` → `username_snapshot` in the INSERT.
- Applies to both the product-line path and `createServiceTransaction`.

**`list(query)`**
- Add `username_snapshot` to the SELECT.
- If `query.username` is provided: `WHERE username_snapshot = @username`.

**`getById(id)`**
- Return `username_snapshot` (already returned via `SELECT *`, no change needed).

### 4.4 Route (`server/routes/transactions.js`)

```js
router.post('/', (req, res) => {
  const result = transactions.create(req.body, req.user);
  // ...
});
```

---

## 5. i18n

New keys required in both `en.json` and `ar.json`:

| Key | English | Arabic |
|-----|---------|--------|
| `txns.itemCount` | `#` | `#` |
| `txns.user` | `User` | `المستخدم` |
| `txns.filterUser` | `User` | `المستخدم` |
| `txns.quickToday` | `Today` | `اليوم` |
| `txns.quickWeek` | `This Week` | `هذا الأسبوع` |
| `txns.quickMonth` | `This Month` | `هذا الشهر` |
| `txns.quickYear` | `This Year` | `هذه السنة` |
| `txns.clearFilters` | `Clear` | `مسح` |

---

## 6. Files Touched

| File | Change |
|------|--------|
| `server/db/migrate.js` | Add `user_id` + `username_snapshot` column migrations |
| `server/db/schema.sql` | Add columns to `transactions` table definition |
| `server/repositories/transactions.js` | `create()` accepts `user`; `list()` filters/returns username |
| `server/routes/transactions.js` | Pass `req.user` to `create()` |
| `client/src/pages/NewTransaction.jsx` | Full history-section redesign |
| `client/src/api/transactions.js` | Pass `username` param in `listTransactions` |
| `client/src/i18n/en.json` | New i18n keys |
| `client/src/i18n/ar.json` | New i18n keys |

---

## 7. Out of Scope

- Exporting the filtered transactions table to CSV (separate feature).
- Editing or deleting transactions.
- Any changes to the new-transaction form above the history section.
