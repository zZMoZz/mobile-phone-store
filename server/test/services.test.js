import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('services backend', () => {
  let app;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ app, db, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('has the new tables and transaction columns after seed/migrate', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['option_lists', 'services', 'service_shortcuts']));
    const txnCols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    expect(txnCols).toEqual(expect.arrayContaining(['service_id', 'service_data']));
  });
});
