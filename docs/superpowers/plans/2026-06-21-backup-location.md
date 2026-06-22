# Backup Location Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persistent backup-folder setting; auto backups write only to `data/backups/`; manual backups prompt for an extra destination via Windows folder picker each time.

**Architecture:** `createBackup(extraDir?)` in `server/lib/backup.js` accepts an optional destination instead of reading from settings. The `POST /backup` route reads `{ dir }` from the request body and forwards it. The frontend calls `pickFolder()` before `createBackup(dir)` so the user chooses a location at backup time, not in settings.

**Tech Stack:** Node.js ESM, Express, better-sqlite3, React + Mantine, i18next, Vitest + Supertest.

## Global Constraints

- ESM everywhere — use `.js` extensions in imports.
- Never hardcode UI strings — all display text must have keys in both `en.json` and `ar.json`.
- `backup_dir` column stays in the DB (removing a SQLite column requires recreating the table — not worth the risk). It just becomes unused.
- Do not change scheduled backup scheduling logic.

---

### Task 1: Strip `backup_dir` read from `createBackup()` and accept `extraDir` param

**Files:**
- Modify: `server/lib/backup.js`

**Interfaces:**
- Produces: `createBackup(extraDir?: string): Promise<{ fileName: string, path: string }>`
- Produces: `runScheduledBackup(): Promise<void>` — unchanged signature, calls `createBackup()` with no arg

- [ ] **Step 1: Open `server/lib/backup.js` and replace the function signature and settings-read block**

  Current `createBackup` (lines 54–78) reads `getSettings()?.backup_dir`. Replace the entire function with:

  ```js
  /**
   * Creates a consistent copy of the SQLite database under the local backups dir.
   * If `extraDir` is provided the finished backup is also copied there (best-effort).
   * Old backups in each folder are pruned. Returns { fileName, path } of the local backup.
   */
  export async function createBackup(extraDir) {
    ensureDataDirs();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${PREFIX}${stamp}.db`;

    const localPath = await writeBackupTo(BACKUPS_DIR, fileName);
    pruneBackups(BACKUPS_DIR);

    if (extraDir) {
      const resolved = path.resolve(extraDir);
      if (resolved !== path.resolve(BACKUPS_DIR)) {
        try {
          fs.mkdirSync(extraDir, { recursive: true });
          const extDest = path.join(extraDir, fileName);
          const extTmp = `${extDest}.tmp`;
          fs.copyFileSync(localPath, extTmp);
          fs.renameSync(extTmp, extDest);
          pruneBackups(extraDir);
        } catch (err) {
          console.warn(`Backup: could not copy to "${extraDir}":`, err.message);
        }
      }
    }

    return { fileName, path: localPath };
  }
  ```

  Also remove the now-unused import `import { get as getSettings } from '../repositories/settings.js';` from the top of the file.

- [ ] **Step 2: Verify the file is clean**

  Run:
  ```bash
  node --input-type=module --eval "import('./server/lib/backup.js').then(() => console.log('ok'))"
  ```
  Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add server/lib/backup.js
  git commit -m "refactor(backup): accept extraDir param instead of reading backup_dir from settings"
  ```

---

### Task 2: Update `POST /backup` route to forward `dir` from request body

**Files:**
- Modify: `server/routes/data.js`

**Interfaces:**
- Consumes: `createBackup(extraDir?)` from Task 1
- Request body: `{ dir?: string }` — dir is optional; omit to skip extra copy

- [ ] **Step 1: Edit the `/backup` handler in `server/routes/data.js`**

  Replace lines 11–18:

  ```js
  router.post('/backup', requireAdmin, async (req, res, next) => {
    try {
      const result = await createBackup(req.body?.dir || undefined);
      logActivity({ userId: req.user.id, username: req.user.username, action: 'create_backup' });
      res.json({ ok: true, file: result.fileName });
    } catch (err) {
      next(err);
    }
  });
  ```

- [ ] **Step 2: Run the test suite to confirm nothing is broken**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add server/routes/data.js
  git commit -m "feat(backup): accept optional dir in POST /backup body"
  ```

---

### Task 3: Remove `backup_dir` from the settings ALLOWED list

**Files:**
- Modify: `server/repositories/settings.js`

**Interfaces:**
- The `backup_dir` key can no longer be read or written through `GET/PUT /api/settings`.

- [ ] **Step 1: Edit `server/repositories/settings.js`**

  Remove `'backup_dir'` from the `ALLOWED` array (line 9). The array should become:

  ```js
  const ALLOWED = [
    'currency',
    'default_language',
    'default_theme',
    'store_name_en',
    'store_name_ar',
    'low_stock_threshold',
    'backup_interval_hours',
  ];
  ```

- [ ] **Step 2: Run tests**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add server/repositories/settings.js
  git commit -m "refactor(settings): remove backup_dir from allowed settings keys"
  ```

---

### Task 4: Update the frontend API helper and Settings page

**Files:**
- Modify: `client/src/api/settings.js`
- Modify: `client/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `POST /api/backup` with optional `{ dir }` body (Task 2)
- Consumes: `GET /api/settings/folder-picker` — unchanged

- [ ] **Step 1: Update `createBackup` in `client/src/api/settings.js`**

  Replace the current `createBackup` function (lines 13–15):

  ```js
  export async function createBackup(dir) {
    const { data } = await api.post('/backup', dir ? { dir } : {});
    return data;
  }
  ```

  Also remove the now-unused `pickFolder` export if it's only used on the Settings page — actually keep it, it's called from the Settings page backup handler (see next step).

- [ ] **Step 2: Update the `backup()` handler in `client/src/pages/Settings.jsx`**

  The current handler (lines 133–143) calls `createBackup()` with no argument. Replace it:

  ```js
  const backup = async () => {
    setBackingUp(true);
    try {
      const dir = await pickFolder();
      const res = await createBackup(dir || undefined);
      notifications.show({ message: `${t('settings.backupDone')}: ${res.file}`, color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setBackingUp(false);
    }
  };
  ```

  Note: `pickFolder()` returns `null` when the user cancels the folder picker. Passing `undefined` to `createBackup` means no extra copy — backup still runs to `data/backups/`.

- [ ] **Step 3: Remove the "Backup Folder" field from the settings form in `Settings.jsx`**

  Delete the entire `TextInput` block for `backup_dir` (lines 259–278 in the current file):

  ```jsx
  <TextInput
    label={t('settings.backupFolder')}
    description={t('settings.backupFolderHint')}
    placeholder="G:\\My Drive\\HotlineBackups"
    value={values.backup_dir || ''}
    onChange={set('backup_dir')}
    rightSection={
      <ActionIcon
        variant="subtle"
        onClick={async () => {
          const path = await pickFolder();
          if (path) set('backup_dir')(path);
        }}
      >
        <IconFolderOpen size={16} />
      </ActionIcon>
    }
    rightSectionPointerEvents="all"
  />
  ```

  After deletion, verify that `IconFolderOpen` is no longer used anywhere in the file. If unused, remove it from the imports at the top:

  ```js
  // Remove IconFolderOpen from this line:
  import {
    IconDeviceFloppy,
    IconDatabaseExport,
    IconFileExport,
    IconInfoCircle,
    IconPlus,
    IconPencil,
    IconTrash,
  } from '@tabler/icons-react';
  ```

- [ ] **Step 4: Verify the dev server compiles cleanly**

  ```bash
  npm run dev
  ```
  Open `http://localhost:5173/settings`. Confirm:
  - No "Backup Folder" field in the general settings form
  - Clicking "Create Backup" opens the Windows folder picker, then shows a success notification
  - Cancelling the folder picker still completes the backup (notification appears)

  Stop the dev server.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/api/settings.js client/src/pages/Settings.jsx
  git commit -m "feat(settings): remove persistent backup folder; prompt for location at backup time"
  ```

---

### Task 5: Remove unused i18n keys

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`

- [ ] **Step 1: Remove `backupFolder` and `backupFolderHint` from `en.json`**

  In `client/src/i18n/en.json`, find the `settings` object and delete these two lines:

  ```json
  "backupFolder": "Backup Folder",
  "backupFolderHint": "Optional. Backups are also copied here (e.g. a Google Drive synced folder). Leave blank for local backups only.",
  ```

- [ ] **Step 2: Remove the same keys from `ar.json`**

  In `client/src/i18n/ar.json`, delete:

  ```json
  "backupFolder": "مجلد النسخ الاحتياطي",
  "backupFolderHint": "اختياري. تُنسخ النسخ الاحتياطية هنا أيضًا (مثل مجلد متزامن مع Google Drive). اتركه فارغًا للنسخ المحلي فقط.",
  ```

- [ ] **Step 3: Run tests**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add client/src/i18n/en.json client/src/i18n/ar.json
  git commit -m "chore(i18n): remove unused backupFolder and backupFolderHint keys"
  ```
