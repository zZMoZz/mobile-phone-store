import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('option lists API', () => {
  let app;
  let cleanup;
  beforeAll(async () => { ({ app, cleanup } = await setupTestApp()); });
  afterAll(() => cleanup());

  it('creates a list with options and reads them back as an array', async () => {
    const res = await request(app)
      .post('/api/option-lists')
      .send({ name_en: 'Providers', name_ar: 'المزودون', options: ['Vodafone', ' WE ', '', 'Orange'] });
    expect(res.status).toBe(201);
    expect(res.body.options).toEqual(['Vodafone', 'WE', 'Orange']); // trimmed, blanks removed
  });

  it('rejects a list with a missing name', async () => {
    const res = await request(app).post('/api/option-lists').send({ name_en: 'Only EN', options: [] });
    expect(res.status).toBe(400);
  });

  it('updates options and deletes', async () => {
    const created = await request(app)
      .post('/api/option-lists')
      .send({ name_en: 'Temp', name_ar: 'مؤقت', options: ['a'] });
    const upd = await request(app)
      .put(`/api/option-lists/${created.body.id}`)
      .send({ options: ['x', 'y'] });
    expect(upd.body.options).toEqual(['x', 'y']);
    expect(upd.body.name_en).toBe('Temp'); // unchanged
    const del = await request(app).delete(`/api/option-lists/${created.body.id}`);
    expect(del.status).toBe(204);
  });
});
