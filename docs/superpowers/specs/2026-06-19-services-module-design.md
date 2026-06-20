# Services Module Redesign — Design Spec

_Date: 2026-06-19_

## Context

Today a "service" is a thin `service_types` row (name + `default_fee` + `consumes_parts`),
recorded through a tab in New Transaction where profit comes from spare-parts margin. The
store actually runs high-frequency services (top-ups, bill payments, maintenance) that vary
by **provider/type** and are slow to enter by hand each time. We're redesigning Services
into a faster, field-rich module with reusable **shortcuts**.

### Confirmed decisions
1. **Pure revenue** — a service stores only a **Cost**; `profit = 0`; expenses are recorded
   separately as purchases. No spare parts, no inventory link.
2. **Service → Shortcut → Transaction** — a Service defines custom fields; a Shortcut is a
   preset of a service, shown as a clickable card; clicking pre-fills a new service txn.
3. **Select options:** **shared option lists** (e.g. *Providers*) **+ inline** per-field options.
4. **Analytics:** **Service Revenue** is its own KPI; "Profit" stays product-sales-only.
5. **Option labels:** single free-text string (shown as-is in both languages).
6. **Recording surface:** the **Services page** becomes the record hub (cards); the Service
   tab is **removed** from New Transaction (which keeps sale/purchase).
7. **Migration:** replace the old model — re-seed services in the new shape, drop
   spare-parts-on-service; past service transactions remain as read-only history.
8. **Storage:** JSON columns for the field schema/values (not EAV); field types are a strict
   set: `text | number | select`.

## Data model

New tables (follow the existing bilingual reference-repo pattern in
`server/repositories/reference.js`):

- **`services`**: `id, name_en, name_ar, fields (JSON), sort_order`. _(Note: `is_protected`
  was deliberately deferred in Phase 1 — services aren't a required FK, so deleting one is
  safe (`transactions.service_id` → NULL, snapshot retained). Revisit in Phase 2 if the
  management UI wants protected default services; adding the column is a one-line migration.)_
  `fields` = array of field defs:
  ```json
  [
    {"key":"provider","label_en":"Provider","label_ar":"المزود","type":"select","required":true,"option_list_id":1},
    {"key":"type","label_en":"Type","label_ar":"النوع","type":"select","required":true,"options":["شحن","كارت فكة","أخرى"]}
  ]
  ```
  A built-in **Cost** (number, required) is implicit — never part of `fields`.
- **`option_lists`**: `id, name_en, name_ar, options (JSON array of strings)`. e.g. Providers →
  `["Vodafone","WE","Orange","E&"]`. Managed alongside categories/brands.
- **`service_shortcuts`**: `id, service_id (FK), label_en, label_ar, color, sort_order,
  preset_values (JSON)`. `preset_values` = `{ "provider":"Vodafone", "type":"شحن", "cost":null }`
  (cost preset optional; usually entered at txn time).
- **`transactions`** (reused, `type='service'`): add a **`service_data` (JSON)** snapshot and a
  `service_id` column. A service txn sets `total = cost`, `profit = 0`, `cost_total = 0`,
  `subtotal = 0`, `fee = 0`. Snapshot shape:
  ```json
  {"service_id":1,"service_name":"Top-up","shortcut_id":3,
   "fields":[{"label_en":"Provider","label_ar":"المزود","value":"Vodafone"},
             {"label_en":"Type","value":"شحن"}],"cost":100}
  ```
  Snapshotting preserves history if a service's schema later changes. Legacy
  `service_type_id` stays nullable for old rows.

## Validation
Required fields enforced; `number` coerced; `select` value should belong to its list but
stays editable; **Cost required (> 0)**. Centralize in the new `services` repo + a
`transactions.create` service branch.

## Recording flow (Services page)
Shortcut **cards** grouped by service (color-tinted). Tap a card → modal pre-filled with the
service's fields + Cost (from `preset_values`) → edit (mainly Cost) → save → one service
transaction via `transactions.create`. A "Record without shortcut" path lets you pick a
service and fill fields. Mirrors the snappy feel of `AddProductModal`.

## Management UI
- **Services & fields**: define services, their custom fields (type, required, shared-list-or-
  inline options). New management surface modeled on `client/src/pages/ManageLists.jsx`.
- **Shortcuts**: create/edit presets per service (label, color, preset values, order).
- **Option lists**: add a third reference section to **ManageLists.jsx** next to categories/
  brands, reusing its CRUD + the protected-default pattern.

## Analytics
Add a **Service Revenue** KPI = `SUM(total) WHERE type='service'` in
`server/repositories/analytics.js`, exposed on the dashboard
(`client/src/pages/Dashboard.jsx`). Service txns no longer contribute to "Profit" (profit=0),
and should be **excluded** from the sales+profit trend's profit line (kept as revenue only).

## Migration & seed (`server/db/migrate.js`, `seed.js`)
- Idempotent `CREATE TABLE`/`ALTER TABLE` for the new tables + `transactions.service_data`/
  `service_id` (mirroring the existing `applyColumnMigrations` pattern).
- Re-seed: Providers option list; services **Top-up** (Provider*, Type*), **Bill Payment**
  (Provider), **Maintenance** (none) — all with built-in Cost; a few starter shortcuts
  (Vodafone شحن, Orange فاتورة, …). Stop seeding `SERVICE_TYPES`.

## Files (representative)
- Backend: `server/db/{schema.sql,migrate.js,seed.js}`; new repos
  `server/repositories/{services.js,optionLists.js,serviceShortcuts.js}` + service branch in
  `transactions.js`; new routes + `routes/index.js`; `analytics.js`. Deprecate
  `serviceTypes.{js}`/routes.
- Frontend: rework `pages/Services.jsx` (record hub), new management views, option-lists
  section in `pages/ManageLists.jsx`, remove service tab in `pages/NewTransaction.jsx`,
  `pages/Dashboard.jsx` KPI, `api/*`, i18n `en.json`/`ar.json`.

## Phasing (for the implementation plan)
1. Backend data model + repos + `transactions.create` service branch + analytics + tests.
2. Management UI (services/fields, option lists, shortcuts).
3. Recording UI (cards) + remove New Transaction service tab.
4. Dashboard KPI + i18n + polish.

## Out of scope / warnings
- **No auth (v1):** shortcuts are **shared**, not per-user.
- **Expense tracking** (distinguishing expense purchases from inventory purchases to net
  against service revenue) is a **separate future enhancement**.
- Old service transactions remain as historical records; the spare-parts-on-service flow is removed.

## Verification
- `npm test`: new repo/route tests (service CRUD, option lists, shortcuts, service-txn
  recording sets total=cost/profit=0 + snapshot, analytics Service Revenue). Migration test on
  a simulated old DB.
- `npm run dev`: define a service + shared Providers list + shortcut → tap card → record →
  appears in Transactions; Dashboard shows Service Revenue; New Transaction has no service tab;
  Arabic labels render.
