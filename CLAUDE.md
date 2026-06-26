# CLAUDE.md

Guidance for working in this repository.

## What this is

Internal management web app for a small mobile phone store. **Staff-only**, runs
**locally on one Windows laptop**, offline-capable. Two core jobs: manage product
**inventory** and record **transactions** (purchases, sales, services). Supports
**dark mode** and **Arabic + English** (RTL for Arabic). No customer-facing features,
no printed receipts. Access is **login-based (JWT)** with **per-user capabilities**
(see below).

## Stack

- **Backend:** Node.js + Express (ESM), SQLite via `better-sqlite3` (synchronous).
- **Frontend:** React + Vite + **Mantine** UI, `react-router-dom`, `axios`,
  `i18next` / `react-i18next`.
- **Tests:** Vitest + Supertest (backend logic: stock math, profit, quick-add, search).

## Layout

```
server/            Express API + SQLite
  index.js         entry: seeds DB then starts listener (port 4000)
  app.js           createApp() — express app (importable by tests, no listener)
  db/              connection.js, schema.sql, migrate.js, seed.js, paths.js
  repositories/    data access (one module per resource)
  routes/          express routers (index.js aggregates under /api)
  lib/             shared helpers (validation, image handling)
client/            Vite React app
  src/
    i18n/          en.json, ar.json, index.js (setLanguage handles RTL)
    theme/         Mantine theme + color-scheme key
    lib/format.js  currency (EGP) + date formatting
    api/client.js  axios instance (baseURL /api)
    components/    AppLayout + shared UI
    pages/         one component per route
data/              store.db, uploads/, backups/  (gitignored — runtime only)
assets/            default-product.svg
```

## Commands

```bash
npm install            # root (server) deps
npm --prefix client install   # client deps (also run by `npm run build`)
npm run seed           # apply schema + insert default reference data
npm run dev            # dev: Express (4000, --watch) + Vite (5173, proxies /api)
npm test               # backend test suite (vitest)
npm run build          # build client into client/dist
npm start              # production: Express serves API + client/dist on 4000
```

`start.bat` builds the client and launches the server for store use.

## Conventions & key facts

- **ESM everywhere** (`"type": "module"`). Use `.js`/`.jsx` extensions in imports.
- **DB access** goes through `getDb()` (`server/db/connection.js`); foreign keys ON,
  WAL mode. Wrap multi-step writes (e.g. a transaction + stock adjustment) in a
  `db.transaction(...)` so they are atomic.
- **Tests** set `STORE_DB_PATH` to a temp file before importing the app, so the real
  `data/store.db` is never touched.
- **Money** is stored as plain numbers; format only for display via
  `client/src/lib/format.js`. Currency default is EGP, configurable in settings.
- **i18n:** never hardcode UI strings — add keys to both `en.json` and `ar.json`.
  Category/brand/service names are stored bilingual (`name_en`, `name_ar`); product
  `name` is a single free-form field (Arabic or English).
- **Barcode** input is just a text field that fires on Enter (keyboard-wedge scanners
  type then press Enter — no driver needed).
- **Stock & profit:** purchases increment quantity; sales/services decrement it.
  `unit_cost` is snapshotted per line; `profit = total − cost_total`.
- **Images:** uploaded to `data/uploads/`; missing image falls back to
  `/assets/default-product.svg`.
- **Auth & capabilities:** JWT login (`server/middleware/authenticate.js` attaches
  `req.user`). Access is gated by **per-user capabilities**, not fixed roles — the
  catalog and helpers live in `server/lib/permissions.js` (`CAPABILITIES`,
  `userHas`, `sanitizePermissions`, `PRESETS`); the client mirror is
  `client/src/lib/permissions.js`. Each user has a `permissions` JSON array; the
  **owner** implicitly holds all capabilities and is the **only** account that can
  assign them. `role` (`owner`/`admin`/`staff`) is now just a **preset label** used
  to pre-fill the capability checklist — never gate on it; gate on a capability.
  Backend: `requirePermission(cap)` middleware (`server/middleware/`); transactions
  gate per type. Frontend: `useAuth().can(cap)` plus `<ProtectedRoute requiredCap>`.
  Changing a user's capabilities bumps `token_version` (forces re-login). New
  capabilities must be added to **both** `permissions.js` files and given i18n
  labels (`permissions.caps.*`, underscored) in `en.json` + `ar.json`.

See `.claude/plans/` for the approved build plan and phase breakdown.
