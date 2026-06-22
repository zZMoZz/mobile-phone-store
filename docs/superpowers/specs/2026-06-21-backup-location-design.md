# Backup Location Redesign

**Date:** 2026-06-21

## Problem

Backups currently write to two places: always to `data/backups/` (project folder) and optionally to a persistent `backup_dir` saved in settings. The persistent folder setting adds friction and is unnecessary — users only need to choose a destination when making a manual backup.

## Goal

- Automatic/scheduled backups: write only to `data/backups/`
- Manual backup: prompt the user for an extra destination via the Windows folder picker; if chosen, copy there in addition to `data/backups/`; if cancelled, backup still runs (local copy only)
- Remove the persistent backup folder setting entirely

## Changes

### Backend

**`server/lib/backup.js`**
- `createBackup(extraDir?)`: accept optional `extraDir` parameter instead of reading `backup_dir` from settings. Copy to `extraDir` if provided, same best-effort logic as before.
- `runScheduledBackup()`: no change (calls `createBackup()` with no arg).

**`server/routes/data.js`**
- `POST /backup`: read optional `{ dir }` from `req.body`; pass to `createBackup(dir)`.

**`server/repositories/settings.js`**
- Remove `backup_dir` from the `ALLOWED` list. Column stays in DB (unused) to avoid a SQLite table-recreation migration.

**`server/routes/settings.js`**
- `/folder-picker` route stays (used by the manual backup flow).

### Frontend

**`client/src/api/settings.js`**
- `createBackup(dir?)`: include `{ dir }` in POST body when provided.

**`client/src/pages/Settings.jsx`**
- Remove the "Backup Folder" `TextInput` + folder-picker `ActionIcon` from the main settings form.
- Update `backup()` handler: call `pickFolder()` first → pass chosen path (or undefined if cancelled) to `createBackup`.

### i18n

Remove unused keys `settings.backupFolder` and `settings.backupFolderHint` from `en.json` and `ar.json`.

## Out of scope

- DB migration to drop `backup_dir` column (column becomes unused; migration risk not worth it)
- Any changes to scheduled backup scheduling logic
