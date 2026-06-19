import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

describe('categories & brands API', () => {
  let app;
  let cleanup;

  beforeAll(async () => {
    ({ app, cleanup } = await setupTestApp());
  });

  afterAll(() => cleanup());

  it('creates a category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name_en: 'Tablets', name_ar: 'أجهزة لوحية' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name_en).toBe('Tablets');
  });

  it('rejects a category missing a name', async () => {
    const res = await request(app).post('/api/categories').send({ name_en: 'Only EN' });
    expect(res.status).toBe(400);
  });

  it('rejects a case-insensitive duplicate name', async () => {
    await request(app).post('/api/brands').send({ name_en: 'Nokia', name_ar: 'نوكيا' });
    const dup = await request(app).post('/api/brands').send({ name_en: '  nokia ', name_ar: 'نوكيا' });
    expect(dup.status).toBe(409);
  });

  it('updates a category name', async () => {
    const created = await request(app)
      .post('/api/categories')
      .send({ name_en: 'Wearables', name_ar: 'ارتداء' });
    const upd = await request(app)
      .put(`/api/categories/${created.body.id}`)
      .send({ name_en: 'Wearable Tech', name_ar: 'أجهزة ارتداء' });
    expect(upd.status).toBe(200);
    expect(upd.body.name_en).toBe('Wearable Tech');
  });

  it('deletes an unused brand', async () => {
    const created = await request(app).post('/api/brands').send({ name_en: 'Temp Brand', name_ar: 'ماركة مؤقتة' });
    const del = await request(app).delete(`/api/brands/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it('blocks deleting a category still used by a product', async () => {
    const cat = await request(app).post('/api/categories').send({ name_en: 'In Use', name_ar: 'مستخدمة' });
    const brand = await request(app).post('/api/brands').send({ name_en: 'In Use B', name_ar: 'مستخدمة ب' });
    await request(app).post('/api/products').send({
      name: 'Uses Category',
      buying_price: 10,
      selling_price: 20,
      category_id: cat.body.id,
      brand_id: brand.body.id,
    });

    const del = await request(app).delete(`/api/categories/${cat.body.id}`);
    expect(del.status).toBe(409);
  });

  it('reassigns products to another category when deleting with moveTo', async () => {
    const from = await request(app).post('/api/categories').send({ name_en: 'From Cat', name_ar: 'من' });
    const to = await request(app).post('/api/categories').send({ name_en: 'To Cat', name_ar: 'إلى' });
    const brand = await request(app).post('/api/brands').send({ name_en: 'Reassign B', name_ar: 'علامة نقل' });
    const product = await request(app).post('/api/products').send({
      name: 'Moves Category',
      buying_price: 10,
      selling_price: 20,
      category_id: from.body.id,
      brand_id: brand.body.id,
    });

    const del = await request(app).delete(`/api/categories/${from.body.id}`).query({ moveTo: to.body.id });
    expect(del.status).toBe(204);

    // The source category is gone and the product now points at the target.
    const list = await request(app).get('/api/categories');
    expect(list.body.some((c) => c.id === from.body.id)).toBe(false);
    const moved = await request(app).get(`/api/products/${product.body.id}`);
    expect(moved.body.category_id).toBe(to.body.id);
  });

  it('list reports the product_count for each record', async () => {
    const cat = await request(app).post('/api/categories').send({ name_en: 'Counted', name_ar: 'معدودة' });
    const brand = await request(app).post('/api/brands').send({ name_en: 'Counted B', name_ar: 'علامة معدودة' });
    await request(app).post('/api/products').send({
      name: 'Counts Category',
      buying_price: 10,
      selling_price: 20,
      category_id: cat.body.id,
      brand_id: brand.body.id,
    });
    const list = await request(app).get('/api/categories');
    expect(list.body.find((c) => c.id === cat.body.id).product_count).toBe(1);
  });

  it('always has a protected Generic category and brand that cannot be deleted', async () => {
    for (const kind of ['categories', 'brands']) {
      const list = await request(app).get(`/api/${kind}`);
      const generic = list.body.find((x) => x.is_protected === 1);
      expect(generic, `${kind} should have a protected default`).toBeDefined();
      expect(generic.name_en).toBe('Generic');
      const del = await request(app).delete(`/api/${kind}/${generic.id}`);
      expect(del.status).toBe(409); // protected → blocked
    }
  });
});
