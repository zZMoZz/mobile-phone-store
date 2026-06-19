import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Points the DB at a fresh temp file BEFORE any server module is imported,
 * then dynamically imports the app + db so they bind to the temp database.
 * Returns { app, db, cleanup }. Call cleanup() in afterAll/afterEach.
 *
 * Must be called from within a test (after env can be set), e.g.:
 *   const { app, db, cleanup } = await setupTestApp();
 */
export async function setupTestApp() {
  const dbPath = path.join(os.tmpdir(), `store-test-${randomUUID()}.db`);
  process.env.STORE_DB_PATH = dbPath;
  // Isolate backups in a temp dir so createBackup/prune never touch real data/backups.
  const backupsDir = path.join(os.tmpdir(), `store-test-backups-${randomUUID()}`);
  process.env.STORE_BACKUPS_DIR = backupsDir;

  // Import after env is set so connection.js picks up the temp path.
  const { seed } = await import('../db/seed.js');
  const { getDb, closeDb } = await import('../db/connection.js');
  const { createApp } = await import('../app.js');

  seed();
  const db = getDb();
  const app = createApp();

  const cleanup = () => {
    closeDb();
    for (const ext of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(dbPath + ext);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmSync(backupsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return { app, db, cleanup };
}
