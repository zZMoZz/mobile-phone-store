import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp } from './helpers.js';

describe('transactions API', () => {
  let api;
  let cleanup;

  beforeAll(async () => {
    ({ api, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  // Manual product creation now requires a category and brand (seeded id 1).
  const createProduct = (body) =>
    api
      .post('/api/products')
      .send({ category_id: 1, brand_id: 1, ...body })
      .then((r) => r.body);
  const getProduct = (id) => api.get(`/api/products/${id}`).then((r) => r.body);

  it('purchase increases stock and records expense (no profit)', async () => {
    const p = await createProduct({ name: 'Cable', buying_price: 50, selling_price: 90, quantity: 2 });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'purchase', items: [{ product_id: p.id, quantity: 10, unit_price: 45 }] });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(450); // 10 * 45
    expect(res.body.profit).toBe(0);

    const after = await getProduct(p.id);
    expect(after.quantity).toBe(12); // 2 + 10
  });

  it('sale decreases stock and computes profit from cost snapshot', async () => {
    const p = await createProduct({ name: 'Earbuds', buying_price: 100, selling_price: 180, quantity: 5 });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(360); // 2 * 180
    expect(res.body.cost_total).toBe(200); // 2 * 100
    expect(res.body.profit).toBe(160); // 360 - 200

    const after = await getProduct(p.id);
    expect(after.quantity).toBe(3); // 5 - 2
  });

  it('sale honors an overridden unit price', async () => {
    const p = await createProduct({ name: 'Used Phone', buying_price: 1000, selling_price: 1500, quantity: 1 });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 1, unit_price: 1400 }] });
    expect(res.body.total).toBe(1400);
    expect(res.body.profit).toBe(400); // 1400 - 1000
  });

  it('quick-adds an unregistered item during a sale without negative stock', async () => {
    const res = await api
      .post('/api/transactions')
      .send({
        type: 'sale',
        items: [{ name: 'Random Used Phone', quantity: 1, unit_price: 800, unit_cost: 500 }],
      });
    expect(res.status).toBe(201);
    const productId = res.body.items[0].product_id;
    expect(productId).toBeTruthy();

    const created = await getProduct(productId);
    expect(created.is_temporary).toBe(1);
    expect(created.quantity).toBe(0); // never really in stock
    expect(res.body.profit).toBe(300); // 800 - 500
  });

  it('records a pure-revenue service transaction (total = cost, no profit)', async () => {
    const svc = await api
      .post('/api/services')
      .send({
        name_en: 'Top-up',
        name_ar: 'شحن',
        fields: [{ key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'text', required: true }],
      });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 100, field_values: { provider: 'Vodafone' } });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(100);
    expect(res.body.profit).toBe(0);
    expect(res.body.cost_total).toBe(0);
    expect(res.body.service_id).toBe(svc.body.id);
    expect(res.body.service_data.cost).toBe(100);
    expect(res.body.service_data.fields).toEqual([
      { label_en: 'Provider', label_ar: 'المزود', value: 'Vodafone' },
    ]);
  });

  it('rejects a service transaction missing a required field', async () => {
    const svc = await api
      .post('/api/services')
      .send({
        name_en: 'Bill',
        name_ar: 'فاتورة',
        fields: [{ key: 'provider', label_en: 'Provider', label_ar: 'المزود', type: 'text', required: true }],
      });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 50, field_values: {} });
    expect(res.status).toBe(400);
  });

  it('rejects a service transaction with non-positive cost', async () => {
    const svc = await api.post('/api/services').send({ name_en: 'Maint', name_ar: 'صيانة', fields: [] });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 0 });
    expect(res.status).toBe(400);
  });

  it('lists transactions and fetches one with items', async () => {
    const list = await api.get('/api/transactions').query({ type: 'sale' });
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.items.every((t) => t.type === 'sale')).toBe(true);

    const one = await api.get(`/api/transactions/${list.body.items[0].id}`);
    expect(one.status).toBe(200);
    expect(Array.isArray(one.body.items)).toBe(true);
  });

  it('rejects an unknown transaction type', async () => {
    const res = await api.post('/api/transactions').send({ type: 'gift', items: [] });
    expect(res.status).toBe(400);
  });

  it('product history reflects recorded transactions', async () => {
    const p = await createProduct({ name: 'Tracked', buying_price: 10, selling_price: 20, quantity: 5 });
    await api.post('/api/transactions').send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] });
    const detail = await getProduct(p.id);
    // Initial stock (5) is recorded as a purchase, then the sale — newest first.
    expect(detail.history.length).toBe(2);
    expect(detail.history[0].type).toBe('sale');
    expect(detail.history.some((h) => h.type === 'purchase' && h.quantity === 5)).toBe(true);
  });

  it('stores username_snapshot when a user is present on the JWT', async () => {
    const p = await createProduct({ name: 'SnapPhone', buying_price: 200, selling_price: 300, quantity: 3 });
    const res = await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] });
    expect(res.status).toBe(201);
    // The seeded owner token is injected by the test helper — username must be present.
    expect(typeof res.body.username_snapshot).toBe('string');
    expect(res.body.username_snapshot.length).toBeGreaterThan(0);
  });

  it('filters by username_snapshot', async () => {
    const p = await createProduct({ name: 'FilterPhone', buying_price: 100, selling_price: 150, quantity: 5 });
    await api.post('/api/transactions').send({ type: 'sale', items: [{ product_id: p.id, quantity: 1 }] });

    // The seeded owner's username is the authenticated user for all api calls in this suite.
    const ownerUsername = (await api.get('/api/users')).body[0]?.username;
    expect(ownerUsername).toBeTruthy();

    const filtered = await api.get('/api/transactions').query({ username: ownerUsername });
    expect(filtered.body.items.every((t) => t.username_snapshot === ownerUsername)).toBe(true);

    const noMatch = await api.get('/api/transactions').query({ username: '__nobody__' });
    expect(noMatch.body.items.length).toBe(0);
  });
});
