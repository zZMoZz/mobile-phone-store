# Machine Licensing Design

**Date:** 2026-06-28  
**Status:** Approved

## Problem

The app is an internal store management tool that runs locally on a single Windows laptop. If someone copies the project folder to another machine, it should not work without a valid license for that machine.

## Goals

- App works normally on the licensed machine with no extra steps after activation
- On any unlicensed machine, the app starts but shows a blocking activation screen
- The developer (not the store owner) generates license keys
- Activation is done via a UI field — no file management required
- The license persists across restarts once activated

## Non-Goals

- Online/cloud license validation (no internet required)
- Time-limited or trial licenses
- Multiple simultaneous licensed machines

---

## Approach: HMAC License Key

The license key is `HMAC-SHA256(machineGuid, SECRET_KEY)` encoded as a 64-character hex string.

- `machineGuid` — the Windows MachineGuid from `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`
- `SECRET_KEY` — a long random hex string hardcoded in `server/lib/license.js`

Security is sufficient for this threat model: the source code is private and local, and the license is mathematically tied to one specific machine.

---

## Components

### `server/lib/machine.js`

Reads the Windows MachineGuid from the registry using `reg query`. Exports:

```js
getMachineId() → string   // throws if not on Windows or registry read fails
```

### `server/lib/license.js`

Contains the `SECRET_KEY` constant and exports:

```js
generateKey(machineId) → string       // used by the generate script
validateKey(machineId, key) → boolean // used by middleware and activate route
```

### `server/middleware/requireLicense.js`

Mounted in `server/index.js` before any other middleware. On every non-API `GET` request:

1. Reads stored `license_key` from the `settings` table
2. Reads current machine ID
3. Calls `validateKey(machineId, storedKey)`
4. If valid → `next()` (serve normally)
5. If invalid → respond with the activation HTML page (inline bilingual HTML, no React)

API routes are not blocked (so `POST /api/license/activate` always works).

### `server/routes/license.js`

Handles `POST /api/license/activate`:

1. Read `key` from request body
2. Call `validateKey(getMachineId(), key)`
3. If valid → `UPDATE settings SET value = key WHERE key = 'license_key'` (or insert if missing), respond `{ ok: true }`
4. If invalid → respond `{ ok: false, error: 'Invalid license key' }`

### `server/scripts/generate-license.js`

Standalone CLI script. Usage:

```
node server/scripts/generate-license.js <machineGuid>
```

Prints the license key to stdout. Run by the developer when a store sends their machine ID.

---

## Activation Screen (inline HTML)

The middleware serves a plain HTML page (no React dependency) containing:

- Title in Arabic + English: "هذه النسخة غير مرخصة / This copy is not licensed"
- Machine ID displayed in a read-only copyable input
- Instructions: "Copy the Machine ID above and send it to your developer to receive a license key."
- A text field for the license key
- An Activate button that POSTs to `/api/license/activate`
- On success: `window.location.reload()`
- On failure: shows "Invalid license key" error message

Styled minimally (dark background, centered card) to match the app's dark theme.

---

## Data Storage

License key stored in the existing `settings` table:

| key           | value                        |
|---------------|------------------------------|
| `license_key` | `a3f2b891c4d5e6f7...` (hex) |

No schema changes needed — the settings table already supports arbitrary key/value pairs.

---

## File Changes Summary

| File | Change |
|------|--------|
| `server/lib/machine.js` | New — reads MachineGuid from registry |
| `server/lib/license.js` | New — HMAC keygen + validation |
| `server/middleware/requireLicense.js` | New — blocks unlicensed requests, serves activation page |
| `server/routes/license.js` | New — POST /api/license/activate |
| `server/scripts/generate-license.js` | New — CLI key generator for developer use |
| `server/index.js` | Mount requireLicense middleware before app.listen |
| `server/routes/index.js` | Register /api/license route |
| `package.json` | Add `"license": "node server/scripts/generate-license.js"` script |

---

## Error Cases

| Scenario | Behavior |
|----------|----------|
| Not on Windows | `getMachineId()` throws; server logs error and exits with message |
| Registry read fails | Same as above |
| Wrong key entered | Activation endpoint returns error; screen shows "Invalid license key" |
| Windows reinstalled (new MachineGuid) | License fails → activation screen shown → owner sends new ID → developer issues new key |
| `settings` table has no `license_key` row | Treated as unlicensed |

---

## Developer Workflow

1. Store owner opens app on new machine → sees activation screen → copies Machine ID
2. Owner sends Machine ID to developer (e.g., via WhatsApp)
3. Developer runs: `npm run license <machineGuid>`
4. Developer sends the printed key back to the owner
5. Owner pastes key into the activation field → clicks Activate → app works
