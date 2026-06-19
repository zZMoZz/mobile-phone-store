import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/connection.js';
import { get as getSettings } from '../repositories/settings.js';
import { BACKUPS_DIR, ensureDataDirs } from '../db/paths.js';

const PREFIX = 'store-backup-';
const KEEP = 30; // retention: most recent N backups per folder

function isBackupFile(name) {
  return name.startsWith(PREFIX) && name.endsWith('.db');
}

/**
 * Keeps only the most recent `keep` backups in `dir`, deleting older ones. The
 * ISO timestamp in each filename sorts chronologically, so a descending sort puts
 * the newest first. Best-effort: never throws.
 */
export function pruneBackups(dir, keep = KEEP) {
  let names;
  try {
    names = fs.readdirSync(dir).filter(isBackupFile);
  } catch {
    return; // dir missing/unreadable — nothing to prune
  }
  names.sort().reverse(); // newest first
  for (const name of names.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* ignore */
    }
  }
}

// Writes the live DB to `<dir>/<fileName>` via a temp file + rename so a cloud
// sync client never sees a half-written database.
async function writeBackupTo(dir, fileName) {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, fileName);
  const tmp = `${dest}.tmp`;
  await getDb().backup(tmp);
  fs.renameSync(tmp, dest);
  return dest;
}

/**
 * Creates a consistent copy of the SQLite database under the local backups dir
 * using better-sqlite3's online backup. If an external backup folder is configured
 * (Settings → backup_dir, e.g. a Google-Drive-synced path), the finished backup is
 * also copied there (best-effort). Old backups in each folder are pruned.
 * Returns { fileName, path } of the local backup.
 */
export async function createBackup() {
  ensureDataDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${PREFIX}${stamp}.db`;

  const localPath = await writeBackupTo(BACKUPS_DIR, fileName);
  pruneBackups(BACKUPS_DIR);

  // Off-machine copy: only when configured and pointing somewhere new.
  const externalDir = (getSettings()?.backup_dir || '').trim();
  if (externalDir && path.resolve(externalDir) !== path.resolve(BACKUPS_DIR)) {
    try {
      fs.mkdirSync(externalDir, { recursive: true });
      const extDest = path.join(externalDir, fileName);
      const extTmp = `${extDest}.tmp`;
      fs.copyFileSync(localPath, extTmp);
      fs.renameSync(extTmp, extDest);
      pruneBackups(externalDir);
    } catch (err) {
      console.warn(`Backup: could not copy to external folder "${externalDir}":`, err.message);
    }
  }

  return { fileName, path: localPath };
}

/** Runs a backup for the scheduler/startup hook; logs but never throws. */
export async function runScheduledBackup() {
  try {
    const { fileName } = await createBackup();
    console.log(`Automatic backup created: ${fileName}`);
  } catch (err) {
    console.error('Automatic backup failed:', err.message);
  }
}
