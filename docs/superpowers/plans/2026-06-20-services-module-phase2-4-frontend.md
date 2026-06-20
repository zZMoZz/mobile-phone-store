# Services Module — Phases 2–4 (Frontend) Implementation Plan

**Goal:** Build the client UI for the new Services backend: manage services + custom fields, shared option lists, and shortcut presets; record services from shortcut cards; show Service Revenue on the dashboard; remove the legacy service tab.

**Architecture:** React + Vite + Mantine, `react-router-dom`, `axios`, `i18next`. Reuses existing patterns: `ManageLists.jsx` (reference CRUD), `AddProductModal.jsx` (snappy modal), `Settings.jsx` (forms), `Dashboard.jsx` `StatCard`. The new backend API is already live.

**Verification:** No React test framework exists (tests are backend-only). Each task is verified by `npm --prefix client run build` succeeding (no errors) + JSON validity of locale files + diff review. A final manual smoke via `npm run dev` is listed at the end.

## Global Constraints

- **ESM**, `.jsx`/`.js` extensions in imports. Mantine components; never hardcode UI strings — add keys to **both** `client/src/i18n/en.json` and `ar.json`.
- **Bilingual display:** pick `lang === 'ar' ? x.name_ar : x.name_en` (use `i18n.language`). Arabic inputs get `dir="auto"`.
- **Money** via `client/src/lib/format.js` (`formatMoney`/`formatNumber`).
- **Errors** surfaced via `apiErrorMessage(err, t)` (`client/src/lib/apiError.js`) + Mantine `notifications`.
- Follow existing file conventions; keep components focused.

## API contracts (already implemented backend)

- `GET/POST /api/services`, `PUT/DELETE /api/services/:id` — service `{ id, name_en, name_ar, fields, sort_order }`. `fields[]` = `{ key, label_en, label_ar, type:'text'|'number'|'select', required:boolean, option_list_id?:number, options?:string[] }`.
- `GET/POST /api/option-lists`, `PUT/DELETE /api/option-lists/:id` — `{ id, name_en, name_ar, options:string[] }`.
- `GET /api/service-shortcuts?service_id=`, `POST`, `PUT/DELETE /api/service-shortcuts/:id` — `{ id, service_id, label_en, label_ar, color, sort_order, preset_values:object }`.
- `POST /api/transactions` `{ type:'service', service_id, shortcut_id?, cost, field_values:{[key]:value}, note? }` → returns the created service transaction.

## File structure

- Create: `client/src/api/services.js`, `client/src/api/optionLists.js`, `client/src/api/serviceShortcuts.js`.
- Create: `client/src/pages/ManageServices.jsx` (services + fields builder + per-service shortcuts), route `/services/manage`.
- Modify: `client/src/pages/ManageLists.jsx` (add Option Lists section), `client/src/pages/Services.jsx` (record hub), `client/src/pages/NewTransaction.jsx` (remove service tab), `client/src/pages/Dashboard.jsx` (KPI), `client/src/App.jsx` (route), `client/src/i18n/en.json` + `ar.json`.

---

### Task 8: Client API modules

**Files:** Create `client/src/api/services.js`, `optionLists.js`, `serviceShortcuts.js`.

Mirror `client/src/api/reference.js` style (axios `api` instance, async functions). Provide:
- services: `listServices()`, `createService(body)`, `updateService(id, body)`, `deleteService(id)`.
- optionLists: `listOptionLists()`, `createOptionList(body)`, `updateOptionList(id, body)`, `deleteOptionList(id)`.
- serviceShortcuts: `listServiceShortcuts(serviceId?)` (passes `{ params: { service_id } }` when given), `createServiceShortcut(body)`, `updateServiceShortcut(id, body)`, `deleteServiceShortcut(id)`.

**Verify:** `npm --prefix client run build` passes. **Commit:** `feat(services-ui): client api modules`.

---

### Task 9: Option Lists management (ManageLists.jsx)

**Files:** Modify `client/src/pages/ManageLists.jsx`; i18n.

Add a third `Paper` section "Option Lists" below Categories/Brands. Each row: `name_en`, `name_ar`, and the option count; actions edit/delete (reuse the existing delete-modal pattern but option lists have no product usage, so a simple confirm is fine). The create/edit modal has `name_en`, `name_ar`, and an **options editor** using Mantine `TagsInput` (value = `string[]`), bound to `options`. Use the new `optionLists` api. Reuse `apiErrorMessage`.

i18n keys (en/ar): `lists.optionLists`, `lists.addOptionList`, `lists.newOptionList`, `lists.editOptionList`, `lists.optionsLabel` ("Options"), `lists.optionsHint` ("Type and press Enter").

**Verify:** build passes; JSON valid. **Commit:** `feat(services-ui): manage shared option lists`.

---

### Task 10: Manage Services page (fields builder + shortcuts) at `/services/manage`

**Files:** Create `client/src/pages/ManageServices.jsx`; add route in `client/src/App.jsx` (`<Route path="/services/manage" element={<ManageServices />} />`); i18n.

Two areas on one page:
1. **Services list + editor.** Table of services (localized name, field count); add/edit modal with `name_en`, `name_ar`, and a **fields builder**: a list of field rows, each with `key` (TextInput), `label_en`, `label_ar` (dir auto), `type` (Select: Text/Number/Select), `required` (Switch); when `type==='select'`, a source toggle — **Shared list** (Select populated from `listOptionLists()`, sets `option_list_id`) or **Inline** (`TagsInput`, sets `options`). "Add field" / remove-row buttons. On submit, assemble `fields[]` and POST/PUT. Surface backend validation errors via `apiErrorMessage` (the backend rejects bad types, dup keys, empty selects).
2. **Shortcuts for a selected service.** When a service row is expanded/selected, list its shortcuts (`listServiceShortcuts(serviceId)`); add/edit modal: `label_en`, `label_ar`, `color` (Mantine `ColorInput` or a small swatch `Select`), and **preset values** — render the service's fields as inputs (same renderer as recording) to capture `preset_values`, plus an optional preset `cost` NumberInput. POST/PUT/DELETE via api.

Extract a reusable **`ServiceFieldInput`** helper (renders one field by type, resolving select options from `option_list_id` via a provided optionLists map, or inline `options`) — it will be reused by Task 11's recording modal. Put it in `client/src/components/ServiceFieldInputs.jsx` and export both a single-field input and a `renderServiceFields(fields, values, onChange, optionLists)` helper.

i18n keys: `manageServices.*` (title, addService, editService, fieldsBuilder, addField, fieldKey, fieldType, typeText, typeNumber, typeSelect, required, optionSource, sharedList, inlineOptions, shortcuts, addShortcut, editShortcut, label, color, presetValues, presetCost), reuse `services.nameEn`/`nameAr`.

**Verify:** build passes; JSON valid. **Commit:** `feat(services-ui): manage services, custom fields, and shortcuts`.

---

### Task 11: Services record hub (Services.jsx) + record modal

**Files:** Rewrite `client/src/pages/Services.jsx`; uses `client/src/components/ServiceFieldInputs.jsx` (Task 10) and `createTransaction` (`api/transactions.js`).

- Load `listServices()`, `listServiceShortcuts()`, `listOptionLists()`. Render **shortcut cards** grouped by service (Mantine `Card`/`Button`, tinted by `color`), plus a "Record without shortcut" action per service (or a service picker).
- Tap a card → open a **record modal**: header shows service + shortcut; body renders the service's fields via the shared renderer, pre-filled from the shortcut's `preset_values`; a **Cost** `NumberInput` (required, min 0, pre-filled from preset cost if any). Validate required fields + cost > 0 client-side; on save `createTransaction({ type:'service', service_id, shortcut_id, cost, field_values })`, show success notification, close.
- Add a top-right **"Manage services"** `Button` linking to `/services/manage` (`useNavigate`).
- Remove the old service-types management UI and its `api/serviceTypes` import from this page.

i18n keys: `services.recordTitle`, `services.cost`, `services.recordWithoutShortcut`, `services.manage`, `services.recorded` ("Service recorded"), `services.noShortcuts`. Keep `services.title`.

**Verify:** build passes; JSON valid. **Commit:** `feat(services-ui): record services from shortcut cards`.

---

### Task 12: Remove New-Transaction service tab + Dashboard Service Revenue KPI + i18n sweep

**Files:** Modify `client/src/pages/NewTransaction.jsx`, `client/src/pages/Dashboard.jsx`, i18n.

- **NewTransaction.jsx:** remove `'service'` from the type `SegmentedControl`, the service-type `Select`/fee inputs, and service-only state/branches (`serviceTypeId`, `fee`, `onSelectServiceType`, service payload branch). Keep sale/purchase fully working. Default `type` stays `'sale'`. Remove now-unused `serviceTypes` import/load.
- **Dashboard.jsx:** add a **Service Revenue** `StatCard` using `data.totals.services` (already returned). Fit it into the KPI grid (e.g. make it `cols={{ base: 2, md: 5 }}` or replace `txnCount` placement — keep all existing cards; add the new one). i18n key `dashboard.servicesTotal` ("Service Revenue" / "إيراد الخدمات").
- **i18n sweep:** confirm every new key exists in both `en.json` and `ar.json`; remove obsolete `services.*` keys that no longer have any reference (e.g. `defaultFee`, `consumesParts`, `addService` for the old page, `intro`) **only if unused** after Task 11 — grep first.

**Verify:** `node -e "JSON.parse(...)"` on both locales; `npm --prefix client run build` passes. **Commit:** `feat(services-ui): dashboard service revenue KPI; remove legacy service tab`.

---

## Final verification
- `npm test` (backend unaffected — still 71/71).
- `npm --prefix client run build` clean.
- `npm run dev` smoke: Manage Services → create a service with a shared-list select field + an inline select; add a shortcut; Services page shows the card; record one → it appears in Transactions and Dashboard Service Revenue rises; New Transaction has no service tab; toggle Arabic → labels/RTL correct.

## Out of scope
- `services.is_protected` (deferred, per Phase 1 decision).
- Editing past service transactions; expense-vs-inventory purchase separation.
