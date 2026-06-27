# Transaction Void Feature — Design Spec

**Date:** 2026-06-26  
**Status:** Approved

## Context

Transactions are currently write-once with no correction mechanism. If a staff member records a wrong transaction (wrong type, quantity, or items), they have no way to undo it — the only option was to record a counter-transaction manually. This feature adds a 5-minute void window so staff can quickly correct mistakes, with automatic stock reversal and a clean audit trail in the DB.

## Decisions

| Question | Decision |
|---|---|
| Voided visibility in UI | Disappear from view (soft delete, filtered from all queries) |
| Who can void | Anyone with new `txn.void` capability |
| Time window | 5 minutes from `created_at`, enforced server-side |
| Stock conflict (void would go negative) | Block with a clear error message |
| UX | Plain Void button per row; visible only within window; no countdown |
| Architecture | Soft delete (`voided_at` / `voided_by_id` columns) |

---

## Data Model

**Migration** — two nullable columns added to `transactions`:

```sql
ALTER TABLE transactions ADD COLUMN voided_at TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN voided_by_id INTEGER REFERENCES users(id) DEFAULT NULL;
```

- `voided_at IS NULL` = active transaction
- `voided_at IS NOT NULL` = voided; excluded from all normal queries
- `voided_by_id` records who voided it (FK to users)
- No `status` enum needed — null check is sufficient

---

## Backend

### New Endpoint

`POST /api/transactions/:id/void`  
Requires: `txn.void` capability (via `requirePermission('txn.void')` middleware)

**Execution flow:**

1. Fetch transaction by id → 404 if not found
2. Check `voided_at IS NULL` → 400 `already_voided` if already voided
3. Time check: `(unixepoch('now') − unixepoch(created_at)) > 300` → 403 `window_expired`
4. Stock conflict check (purchase and return types only):
   - For each item, verify `product.quantity >= item.quantity`
   - On failure → 409 `insufficient_stock_to_void` with array of problematic product names
5. Atomic `db.transaction()`:
   - `UPDATE transactions SET voided_at = datetime('now'), voided_by_id = ? WHERE id = ?`
   - Stock reversals (per item):
     - **PURCHASE** → `quantity -= item.quantity` (undo the stock increase)
     - **SALE** → `quantity += item.quantity` (restore sold stock)
     - **RETURN** → `quantity -= item.quantity` (undo the restock)
     - **SERVICE / EXPENSE** → no stock change
6. Return 200 with the updated transaction object

### Repository Changes (`server/repositories/transactions.js`)

- **New function:** `voidTransaction(id, userId)` — encapsulates the atomic void + stock reversal logic
- **`list()` update:** add `AND t.voided_at IS NULL` to the base WHERE clause (voided transactions invisible to all list queries)

---

## Permissions

New capability: `txn.void`

**Files to update:**
- `server/lib/permissions.js` — add `'txn.void'` to `CAPABILITIES`; include in `admin` preset; exclude from `staff` preset
- `client/src/lib/permissions.js` — mirror the same change

**i18n keys** (both `en.json` and `ar.json`):
- `permissions.caps.txn_void` — label for the capability in the user editor checklist

---

## Frontend

### Transactions Table (`client/src/pages/Transactions.jsx`)

Each row gets a **Void** icon button in the actions column, rendered only when:
- `can('txn.void')` is true, AND
- `Date.now() - new Date(row.created_at + 'Z').getTime() < 5 * 60 * 1000` (client-side check, 5 min; the `'Z'` suffix forces UTC parsing since SQLite `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` without a timezone indicator)

No countdown timer. The button simply does not render once the window has passed.

**Void button click:**
1. Show a compact confirmation modal: `"Void this [type]? This will reverse stock effects and cannot be undone."`
2. Two actions: **Cancel** / **Void** (destructive color)
3. On confirm → `POST /api/transactions/:id/void`
4. On success → remove the row from the table immediately; refetch list silently in background
5. On error:
   - `window_expired` → inline alert: "Too late — the 5-minute window has passed."
   - `insufficient_stock_to_void` → inline alert: "Cannot void — stock for [product name(s)] has already been sold or used."
   - Other errors → generic error message

### i18n Keys

New keys needed in both `en.json` and `ar.json`:
- `transactions.void.button` — "Void"
- `transactions.void.confirm_title` — "Void [type]?"
- `transactions.void.confirm_body` — confirmation message
- `transactions.void.confirm_action` — "Void"
- `transactions.void.error_expired` — time window error
- `transactions.void.error_stock` — stock conflict error
- `transactions.void.success` — optional success notification

---

## Stock Reversal Summary

| Transaction Type | Void Effect |
|---|---|
| PURCHASE | `-quantity` per item (stock conflict check applies) |
| SALE | `+quantity` per item (always safe) |
| RETURN | `-quantity` per item (stock conflict check applies) |
| SERVICE | no stock change |
| EXPENSE | no stock change (no items) |

---

## Verification

1. Record a sale → within 5 min, void it → verify product quantity is restored
2. Record a purchase → sell the stock → void the original purchase → expect 409 block
3. Record a service/expense → void it → no stock change, row disappears from table
4. Wait 6 minutes after a transaction → verify Void button is not rendered
5. User without `txn.void` capability → verify Void button never appears
6. Void a transaction twice → expect 400 `already_voided`
