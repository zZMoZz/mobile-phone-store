import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setupTestApp } from './helpers.js';
// NOTE: server modules (lib/backup.js → db/paths.js) must be imported dynamically
// inside tests, after setupTestApp sets STORE_DB_PATH — a static import here would
// bind paths.js to the real database before the temp path is set.

describe('analytics, settings, and data export', () => {
  let api;
  let cleanup;

  beforeAll(async () => {
    ({ api, cleanup } = await setupTestApp());
    // Seed a sale to populate analytics.
    const p = await api
      .post('/api/products')
      .send({ name: 'Widget', buying_price: 40, selling_price: 100, quantity: 10, category_id: 1, brand_id: 1 })
      .then((r) => r.body);
    await api
      .post('/api/transactions')
      .send({ type: 'sale', items: [{ product_id: p.id, quantity: 3 }] });
  });

  afterAll(() => cleanup());

  it('returns analytics overview with totals and trend', async () => {
    const res = await api.get('/api/analytics');
    expect(res.status).toBe(200);
    expect(res.body.totals.sales).toBe(300); // 3 * 100
    expect(res.body.totals.profit).toBe(180); // 3 * (100 - 40)
    expect(Array.isArray(res.body.trend)).toBe(true);
    expect(res.body.trend.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.topProducts)).toBe(true);
  });

  it('reads and updates settings', async () => {
    const get = await api.get('/api/settings');
    expect(get.body.currency).toBe('EGP');

    const upd = await api
      .put('/api/settings')
      .send({ store_name_en: 'Hotline', store_name_ar: 'هوت لاين', low_stock_threshold: 5 });
    expect(upd.body.store_name_en).toBe('Hotline');
    expect(upd.body.store_name_ar).toBe('هوت لاين');
    expect(upd.body.low_stock_threshold).toBe(5);
  });

  it('flags low-stock products using the threshold', async () => {
    await api
      .post('/api/products')
      .send({ name: 'Almost Out', quantity: 1, selling_price: 5, buying_price: 3, category_id: 1, brand_id: 1 });
    const res = await api.get('/api/analytics');
    expect(res.body.lowStock.some((p) => p.name === 'Almost Out')).toBe(true);
  });

  it('creates a backup', async () => {
    const res = await api.post('/api/backup');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.file).toMatch(/\.db$/);
  });

  it('also copies the backup to the configured external folder', async () => {
    const externalDir = path.join(os.tmpdir(), `store-test-external-${randomUUID()}`);
    try {
      const res = await api.post('/api/backup').send({ dir: externalDir });
      expect(res.status).toBe(200);
      expect(fs.existsSync(path.join(externalDir, res.body.file))).toBe(true);
      // No stray temp files left behind by the temp+rename writes.
      expect(fs.readdirSync(externalDir).every((f) => !f.endsWith('.tmp'))).toBe(true);
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it('prunes a backup folder down to the most recent 30', async () => {
    const { pruneBackups } = await import('../lib/backup.js');
    const dir = path.join(os.tmpdir(), `store-test-prune-${randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    try {
      for (let i = 1; i <= 35; i++) {
        fs.writeFileSync(path.join(dir, `store-backup-${String(i).padStart(4, '0')}.db`), 'x');
      }
      pruneBackups(dir, 30);
      const remaining = fs.readdirSync(dir).sort();
      expect(remaining).toHaveLength(30);
      expect(remaining).toContain('store-backup-0035.db'); // newest kept
      expect(remaining).not.toContain('store-backup-0001.db'); // oldest pruned
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exports products and transactions as CSV', async () => {
    const products = await api.get('/api/export/products.csv');
    expect(products.status).toBe(200);
    expect(products.headers['content-type']).toMatch(/text\/csv/);
    expect(products.text).toContain('Name');

    const txns = await api.get('/api/export/transactions.csv');
    expect(txns.status).toBe(200);
    expect(txns.text).toContain('Type');
  });

  it('counts service money as revenue but not as profit', async () => {
    const svc = await api.post('/api/services').send({ name_en: 'Recharge', name_ar: 'شحن', fields: [] });
    const before = await api.get('/api/analytics');
    const profitBefore = before.body.totals.profit;
    const servicesBefore = before.body.totals.services;
    const trendSalesBefore = before.body.trend.reduce((s, b) => s + b.sales, 0);

    await api
      .post('/api/transactions')
      .send({ type: 'service', service_id: svc.body.id, cost: 250 });

    const after = await api.get('/api/analytics');
    expect(after.body.totals.services).toBe(servicesBefore + 250); // revenue counted
    expect(after.body.totals.profit).toBe(profitBefore); // profit unchanged
    const trendSalesAfter = after.body.trend.reduce((s, b) => s + b.sales, 0);
    expect(trendSalesAfter).toBe(trendSalesBefore); // service revenue is NOT in the trend
  });
});
