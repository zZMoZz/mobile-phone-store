import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('service-types API', () => {
  let app;
  let cleanup;

  beforeAll(async () => {
    ({ app, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('lists service types (no longer seeded)', async () => {
    const res = await request(app).get('/api/service-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('creates, updates, and deletes a service type', async () => {
    const created = await request(app)
      .post('/api/service-types')
      .send({ name_en: 'Screen Protector Fitting', name_ar: 'تركيب واقي شاشة', default_fee: 10, consumes_parts: false });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const updated = await request(app).put(`/api/service-types/${id}`).send({ default_fee: 15 });
    expect(updated.body.default_fee).toBe(15);

    const del = await request(app).delete(`/api/service-types/${id}`);
    expect(del.status).toBe(204);
  });

  it('rejects a service type missing names', async () => {
    const res = await request(app).post('/api/service-types').send({ default_fee: 5 });
    expect(res.status).toBe(400);
  });
});
