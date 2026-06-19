import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('health + seed', () => {
  let app;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ app, db, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('responds on /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('seeds default reference data', () => {
    const categories = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
    const services = db.prepare('SELECT COUNT(*) AS c FROM service_types').get().c;
    const settings = db.prepare('SELECT currency FROM settings WHERE id = 1').get();
    expect(categories).toBeGreaterThan(0);
    expect(services).toBeGreaterThan(0);
    expect(settings.currency).toBe('EGP');
  });
});
