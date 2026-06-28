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

