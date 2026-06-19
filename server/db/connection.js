import Database from 'better-sqlite3';
import { DB_PATH, ensureDataDirs } from './paths.js';

let db;

/**
 * Returns the shared better-sqlite3 connection, opening it on first use.
 * Foreign keys are enforced and WAL mode is enabled for better concurrency.
 */
export function getDb() {
  if (!db) {
    ensureDataDirs();
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/** Closes the connection (used by tests). */
export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}
