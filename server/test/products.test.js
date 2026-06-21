import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp } from './helpers.js';

// A complete, valid manual-create payload. Manual product creation now requires a
// unique name, positive prices, and a category + brand (ids 1 are seeded). Tests
// override only the fields they care about.
const validProduct = (overrides = {}) => ({
  name: 'Product',
  buying_price: 50,
  selling_price: 100,
  category_id: 1,
  brand_id: 1,
  ...overrides,
});

describe('products API', () => {
  let api;
  let cleanup;

  beforeAll(async () => {
    ({ api, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('creates a product', async () => {
    const res = await api
      .post('/api/products')
      .send(validProduct({ name: 'iPhone Cable', selling_price: 100, buying_price: 60, barcode: 'A1', quantity: 5 }));
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('iPhone Cable');
    expect(res.body.quantity).toBe(5);
  });

  it('rejects a product without a name', async () => {
    const res = await api.post('/api/products').send(validProduct({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('rejects a product without prices, category, or brand', async () => {
    const noPrice = await api
      .post('/api/products')
      .send({ name: 'No Price', category_id: 1, brand_id: 1, selling_price: 0, buying_price: 0 });
    expect(noPrice.status).toBe(400);

    const noCategory = await api
      .post('/api/products')
      .send(validProduct({ name: 'No Category', category_id: null }));
    expect(noCategory.status).toBe(400);

    const noBrand = await api
      .post('/api/products')
      .send(validProduct({ name: 'No Brand', brand_id: null }));
    expect(noBrand.status).toBe(400);
  });

  it('rejects a duplicate name (case-insensitive)', async () => {
    await api.post('/api/products').send(validProduct({ name: 'Unique Widget' }));
    const dup = await api.post('/api/products').send(validProduct({ name: '  unique widget ' }));
    expect(dup.status).toBe(409);
  });

  it('rejects a duplicate barcode', async () => {
    const res = await api
      .post('/api/products')
      .send(validProduct({ name: 'Dup', barcode: 'A1' }));
    expect(res.status).toBe(409);
  });

  it('looks up a product by barcode', async () => {
    const res = await api.get('/api/products/lookup').query({ barcode: 'A1' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('iPhone Cable');
  });

  it('add-stock increments quantity for an existing barcode', async () => {
    const res = await api
      .post('/api/products/add-stock')
      .send({ barcode: 'A1', quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(8); // 5 + 3
  });

  it('add-stock creates a new product when barcode is unknown', async () => {
    const res = await api
      .post('/api/products/add-stock')
      .send({ barcode: 'NEW9', name: 'New Item', quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.barcode).toBe('NEW9');
    expect(res.body.quantity).toBe(2);
  });

  it('restocks an existing product by id', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'Restock Target', quantity: 4 }));
    const id = created.body.id;

    const res = await api.post(`/api/products/${id}/add-stock`).send({ quantity: 6 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(10); // 4 + 6
  });

  it('rejects restock with a non-positive quantity', async () => {
    const created = await api.post('/api/products').send(validProduct({ name: 'No Negative Restock' }));
    const res = await api
      .post(`/api/products/${created.body.id}/add-stock`)
      .send({ quantity: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when restocking a missing product', async () => {
    const res = await api.post('/api/products/999999/add-stock').send({ quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('restocking at a new cost sets the weighted-average buying price', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'WAC Phone', buying_price: 6500, selling_price: 9000, quantity: 24 }));
    const id = created.body.id;

    const res = await api.post(`/api/products/${id}/add-stock`).send({ quantity: 10, unit_cost: 7000 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(34); // 24 + 10
    // (24*6500 + 10*7000) / 34 = 226000 / 34 ≈ 6647.06
    expect(res.body.buying_price).toBeCloseTo(6647.06, 2);

    // The purchase line records the ACTUAL price paid, not the average.
    const detail = await api.get(`/api/products/${id}`);
    const restockPurchase = detail.body.history.find((h) => h.type === 'purchase' && h.quantity === 10);
    expect(restockPurchase).toBeDefined();
    expect(restockPurchase.unit_cost).toBe(7000);
  });

  it('restocking without a cost leaves the buying price unchanged', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'Same Cost Phone', buying_price: 500, quantity: 5 }));
    const id = created.body.id;

    const res = await api.post(`/api/products/${id}/add-stock`).send({ quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(10);
    expect(res.body.buying_price).toBe(500); // unchanged
  });

  it('records a purchase transaction when created with initial stock', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'Initial Stock Phone', buying_price: 30, quantity: 7 }));
    expect(created.status).toBe(201);
    expect(created.body.quantity).toBe(7);

    const detail = await api.get(`/api/products/${created.body.id}`);
    const purchases = detail.body.history.filter((h) => h.type === 'purchase');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].quantity).toBe(7);
    expect(purchases[0].unit_cost).toBe(30); // cost snapshotted from buying_price
  });

  it('does not record a transaction when created with zero stock', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'Zero Stock Phone', quantity: 0 }));
    expect(created.body.quantity).toBe(0);

    const detail = await api.get(`/api/products/${created.body.id}`);
    expect(detail.body.history).toHaveLength(0);
  });

  it('records a purchase transaction when restocking by id', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'Restock Txn Target', buying_price: 20, quantity: 2 }));
    const id = created.body.id;

    await api.post(`/api/products/${id}/add-stock`).send({ quantity: 5 });

    const detail = await api.get(`/api/products/${id}`);
    expect(detail.body.quantity).toBe(7); // 2 + 5
    const purchases = detail.body.history.filter((h) => h.type === 'purchase');
    expect(purchases).toHaveLength(2); // initial stock + restock
  });

  it('ignores quantity changes via PUT (stock only changes through tracked flows)', async () => {
    const created = await api
      .post('/api/products')
      .send(validProduct({ name: 'No Direct Qty Edit', quantity: 3 }));
    const id = created.body.id;

    const upd = await api
      .put(`/api/products/${id}`)
      .send(validProduct({ name: 'No Direct Qty Edit', quantity: 99 }));
    expect(upd.status).toBe(200);
    expect(upd.body.quantity).toBe(3); // unchanged — PUT can't overwrite stock
  });

  it('updates and deletes a product', async () => {
    const created = await api.post('/api/products').send(validProduct({ name: 'Temp' }));
    const id = created.body.id;

    const upd = await api
      .put(`/api/products/${id}`)
      .send(validProduct({ name: 'Temp', selling_price: 250 }));
    expect(upd.body.selling_price).toBe(250);

    const del = await api.delete(`/api/products/${id}`);
    expect(del.status).toBe(204);

    const gone = await api.get(`/api/products/${id}`);
    expect(gone.status).toBe(404);
  });

  it('lists with search, sort, and pagination', async () => {
    // Seed a few searchable products.
    await api.post('/api/products').send(validProduct({ name: 'Samsung Charger', selling_price: 80 }));
    await api.post('/api/products').send(validProduct({ name: 'Samsung Earbuds', selling_price: 300 }));

    const search = await api.get('/api/products').query({ search: 'Samsung' });
    expect(search.body.items.length).toBeGreaterThanOrEqual(2);
    expect(search.body.items.every((p) => /samsung/i.test(p.name))).toBe(true);

    const sorted = await api
      .get('/api/products')
      .query({ search: 'Samsung', sort: 'selling_price', order: 'asc' });
    const prices = sorted.body.items.map((p) => p.selling_price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const paged = await api.get('/api/products').query({ pageSize: 1, page: 1 });
    expect(paged.body.items.length).toBe(1);
    expect(paged.body.total).toBeGreaterThan(1);
  });

  it('filters by price range and stock status', async () => {
    const inRange = await api.get('/api/products').query({ minPrice: 200, maxPrice: 400 });
    expect(inRange.body.items.every((p) => p.selling_price >= 200 && p.selling_price <= 400)).toBe(true);

    const inStock = await api.get('/api/products').query({ inStock: 'true' });
    expect(inStock.body.items.every((p) => p.quantity > 0)).toBe(true);
  });

  it('filters by quantity range', async () => {
    await api.post('/api/products').send(validProduct({ name: 'Low Qty', selling_price: 5, quantity: 1 }));
    await api.post('/api/products').send(validProduct({ name: 'High Qty', selling_price: 5, quantity: 50 }));

    const ranged = await api.get('/api/products').query({ minQty: 10, maxQty: 100 });
    expect(ranged.body.items.length).toBeGreaterThan(0);
    expect(ranged.body.items.every((p) => p.quantity >= 10 && p.quantity <= 100)).toBe(true);
  });

  it('returns an inventory summary', async () => {
    const res = await api.get('/api/products/summary');
    expect(res.status).toBe(200);
    expect(res.body.unique_products).toBeGreaterThan(0);
    expect(res.body.total_units).toBeGreaterThan(0);
    expect(res.body.inventory_sell_value).toBeGreaterThanOrEqual(0);
  });

  it('includes a low-stock count in the summary', async () => {
    await api.post('/api/products').send(validProduct({ name: 'Almost Out', quantity: 1 }));
    const res = await api.get('/api/products/summary');
    expect(res.status).toBe(200);
    expect(typeof res.body.low_stock_count).toBe('number');
    expect(res.body.low_stock_count).toBeGreaterThan(0);
    expect(res.body.low_stock_threshold).toBeGreaterThanOrEqual(0);
  });

  it('summary reflects the active filters', async () => {
    const tag = `Sum-${Date.now()}`;
    await api.post('/api/products').send(validProduct({ name: `${tag} A`, quantity: 4, buying_price: 10 }));
    await api.post('/api/products').send(validProduct({ name: `${tag} B`, quantity: 6, buying_price: 10 }));

    const filtered = await api.get('/api/products/summary').query({ search: tag });
    expect(filtered.status).toBe(200);
    expect(filtered.body.unique_products).toBe(2);
    expect(filtered.body.total_units).toBe(10); // 4 + 6
    expect(filtered.body.inventory_cost_value).toBe(100); // (4 + 6) * 10

    const all = await api.get('/api/products/summary');
    expect(all.body.unique_products).toBeGreaterThan(filtered.body.unique_products);
  });

  it('filters to low-stock products and matches the summary count', async () => {
    const summary = await api.get('/api/products/summary');
    const threshold = summary.body.low_stock_threshold;

    const filtered = await api.get('/api/products').query({ lowStock: 'true', pageSize: 200 });
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(summary.body.low_stock_count);
    expect(filtered.body.items.every((p) => p.quantity <= threshold && p.is_temporary === 0)).toBe(true);
  });

  it('uploads a product image and sets image_path', async () => {
    const created = await api.post('/api/products').send(validProduct({ name: 'With Image' }));
    const res = await api
      .post(`/api/products/${created.body.id}/image`)
      .attach('image', Buffer.from('fake-png-bytes'), 'photo.png');
    expect(res.status).toBe(200);
    expect(res.body.image_path).toMatch(/^\/uploads\/.*\.png$/);
  });

  it('includes empty history on product detail', async () => {
    const created = await api.post('/api/products').send(validProduct({ name: 'Detail Test' }));
    const res = await api.get(`/api/products/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});
