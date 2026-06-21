import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp } from './helpers.js';

describe('health + seed', () => {
  let api;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ api, db, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('responds on /api/health', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('seeds default reference data', () => {
    const categories = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
    const services = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
    const settings = db.prepare('SELECT currency FROM settings WHERE id = 1').get();
    expect(categories).toBeGreaterThan(0);
    expect(services).toBeGreaterThan(0);
    expect(settings.currency).toBe('EGP');
  });
});
