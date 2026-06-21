import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp } from './helpers.js';

describe('service shortcuts API', () => {
  let api;
  let cleanup;
  let serviceId;
  beforeAll(async () => {
    ({ api, cleanup } = await setupTestApp());
    const svc = await api
      .post('/api/services')
      .send({ name_en: 'Top-up', name_ar: 'شحن', fields: [{ key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'text' }] });
    serviceId = svc.body.id;
  });
  afterAll(() => cleanup());

  it('creates a shortcut with preset values for a service', async () => {
    const res = await api
      .post('/api/service-shortcuts')
      .send({ service_id: serviceId, label_en: 'Vodafone', label_ar: 'فودافون', color: 'red', preset_values: { provider: 'Vodafone' } });
    expect(res.status).toBe(201);
    expect(res.body.preset_values).toEqual({ provider: 'Vodafone' });
    expect(res.body.service_id).toBe(serviceId);
  });

  it('rejects a shortcut for a missing service', async () => {
    const res = await api
      .post('/api/service-shortcuts')
      .send({ service_id: 999999, label_en: 'X', label_ar: 'س' });
    expect(res.status).toBe(400);
  });

  it('filters shortcuts by service_id', async () => {
    const res = await api.get('/api/service-shortcuts').query({ service_id: serviceId });
    expect(res.body.every((s) => s.service_id === serviceId)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
