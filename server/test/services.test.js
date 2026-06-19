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

  it('creates a service with validated fields', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({
        name_en: 'Top-up',
        name_ar: 'شحن',
        fields: [
          { key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'select', required: true, options: ['Vodafone', 'WE'] },
          { key: 'note', label_en: 'Note', label_ar: 'ملاحظة', type: 'text', required: false },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.fields).toHaveLength(2);
    expect(res.body.fields[0].type).toBe('select');
    expect(res.body.fields[0].options).toEqual(['Vodafone', 'WE']);
  });

  it('rejects an invalid field type', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({ name_en: 'Bad', name_ar: 'سيئ', fields: [{ key: 'x', label_en: 'X', label_ar: 'س', type: 'date' }] });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate field keys', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({
        name_en: 'Dup',
        name_ar: 'مكرر',
        fields: [
          { key: 'a', label_en: 'A', label_ar: 'أ', type: 'text' },
          { key: 'a', label_en: 'A2', label_ar: 'أ٢', type: 'text' },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('rejects a select field with neither an option list nor inline options', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({ name_en: 'NoOpts', name_ar: 'بدون', fields: [{ key: 's', label_en: 'S', label_ar: 'س', type: 'select' }] });
    expect(res.status).toBe(400);
  });

  it('seeds default services and a Providers option list', async () => {
    const services = await request(app).get('/api/services');
    expect(services.body.map((s) => s.name_en)).toEqual(expect.arrayContaining(['Top-up', 'Bill Payment', 'Maintenance']));

    const lists = await request(app).get('/api/option-lists');
    const providers = lists.body.find((l) => l.name_en === 'Providers');
    expect(providers).toBeDefined();
    expect(providers.options).toEqual(expect.arrayContaining(['Vodafone', 'WE', 'Orange', 'E&']));

    const shortcuts = await request(app).get('/api/service-shortcuts');
    expect(shortcuts.body.length).toBeGreaterThan(0);
  });
});
