import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Project root is two levels up from server/db/
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

// All runtime data lives under data/ (gitignored). Tests override DB_PATH via env.
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
// Local backups dir; overridable (tests isolate it so pruning never touches real data).
export const BACKUPS_DIR = process.env.STORE_BACKUPS_DIR || path.join(DATA_DIR, 'backups');

export const DB_PATH = process.env.STORE_DB_PATH || path.join(DATA_DIR, 'store.db');
export const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
export const DEFAULT_PRODUCT_IMAGE = '/assets/default-product.svg';

export function ensureDataDirs() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
