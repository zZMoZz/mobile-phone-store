import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

/**
 * Points the DB at a fresh temp file BEFORE any server module is imported,
 * then dynamically imports the app + db so they bind to the temp database.
 * Returns { app, db, token, api, cleanup }.
 *
 * `token`  — a signed admin JWT for making authenticated requests manually.
 * `api`    — a supertest wrapper pre-configured with the Bearer token.
 *            Use `api.get('/api/...')` instead of `request(app).get('/api/...')`.
 *
 * Call cleanup() in afterAll/afterEach.
 *
 * Must be called from within a test (after env can be set), e.g.:
 *   const { app, api, db, cleanup } = await setupTestApp();
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
  const { signToken } = await import('../lib/auth.js');

  seed();
  const db = getDb();
  const app = createApp();

  // Sign a long-lived admin token for test requests.
  const token = signToken({ sub: 1, username: 'test-admin', role: 'admin' });

  // Thin wrapper: mirrors the request(app) interface but injects the Bearer header
  // on every method call so individual tests don't need to set it manually.
  const bearer = `Bearer ${token}`;
  const api = {
    get: (url) => request(app).get(url).set('Authorization', bearer),
    post: (url) => request(app).post(url).set('Authorization', bearer),
    put: (url) => request(app).put(url).set('Authorization', bearer),
    delete: (url) => request(app).delete(url).set('Authorization', bearer),
    patch: (url) => request(app).patch(url).set('Authorization', bearer),
  };

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

  return { app, db, token, api, cleanup };
}
