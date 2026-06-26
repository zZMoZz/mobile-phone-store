import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestApp } from './helpers.js';
import { userHas, sanitizePermissions, CAPABILITIES, PRESETS } from '../lib/permissions.js';

describe('permissions helpers', () => {
  it('userHas grants the owner everything regardless of stored permissions', () => {
    expect(userHas({ role: 'owner', permissions: [] }, 'see.cost')).toBe(true);
    expect(userHas({ role: 'owner', permissions: [] }, 'users.manage')).toBe(true);
  });

  it('userHas checks the explicit list for non-owners', () => {
    const u = { role: 'staff', permissions: ['txn.sale'] };
    expect(userHas(u, 'txn.sale')).toBe(true);
    expect(userHas(u, 'see.cost')).toBe(false);
    expect(userHas({ role: 'staff' }, 'txn.sale')).toBe(false);
  });

  it('sanitizePermissions drops unknown keys, dedupes, and orders by catalog', () => {
    expect(sanitizePermissions(['bogus', 'see.cost', 'see.cost', 'txn.sale'])).toEqual(['see.cost', 'txn.sale']);
    expect(sanitizePermissions('not-an-array')).toEqual([]);
    expect(sanitizePermissions(undefined)).toEqual([]);
  });

  it('the admin preset is the full catalog and staff is a strict subset', () => {
    expect(PRESETS.admin).toEqual(CAPABILITIES);
    expect(PRESETS.staff.every((k) => CAPABILITIES.includes(k))).toBe(true);
    expect(PRESETS.staff).not.toContain('see.cost');
  });
});

describe('route enforcement by capability', () => {
  let app, db, api, cleanup;
  let salesToken;  // can record sales + view, but not edit inventory / manage anything
  const hash = bcrypt.hashSync('pass123', 10);

  beforeAll(async () => {
    ({ app, db, api, cleanup } = await setupTestApp());
    db.prepare(
      "INSERT INTO users (username, password_hash, role, permissions, force_password_change) VALUES ('clerk', ?, 'staff', ?, 0)",
    ).run(hash, JSON.stringify(['txn.sale', 'inventory.view']));
    salesToken = (await request(app).post('/api/auth/login').send({ username: 'clerk', password: 'pass123' })).body.token;
  });
  afterAll(() => cleanup());

  const asClerk = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${salesToken}`);

  it('blocks a product write without inventory.edit', async () => {
    const res = await asClerk('post', '/api/products').send({ name: 'X', buying_price: 1, selling_price: 2, category_id: 1, brand_id: 1 });
    expect(res.status).toBe(403);
  });

  it('allows a product read without inventory.edit', async () => {
    const res = await asClerk('get', '/api/products');
    expect(res.status).toBe(200);
  });

  it('blocks managing services / lists / settings without the capability', async () => {
    expect((await asClerk('post', '/api/services').send({ name_en: 'S', name_ar: 'س', fields: [] })).status).toBe(403);
    expect((await asClerk('post', '/api/categories').send({ name_en: 'C', name_ar: 'ج' })).status).toBe(403);
    expect((await asClerk('put', '/api/settings').send({ store_name_en: 'Hacked' })).status).toBe(403);
    expect((await asClerk('post', '/api/backup').send({})).status).toBe(403);
    expect((await asClerk('get', '/api/activity-logs')).status).toBe(403);
    expect((await asClerk('get', '/api/users')).status).toBe(403);
  });

  it('enforces the transaction type capability', async () => {
    const product = (await api.post('/api/products').send({ name: 'Sellable', buying_price: 5, selling_price: 10, category_id: 1, brand_id: 1, quantity: 5 })).body;

    // Clerk has txn.sale → allowed.
    const sale = await asClerk('post', '/api/transactions').send({ type: 'sale', items: [{ product_id: product.id, quantity: 1 }] });
    expect(sale.status).toBe(201);

    // Clerk lacks txn.return / txn.expense → forbidden.
    expect((await asClerk('post', '/api/transactions').send({ type: 'expense', label: 'Rent', amount: 10 })).status).toBe(403);
    expect((await asClerk('post', '/api/transactions').send({ type: 'return', items: [] })).status).toBe(403);
  });

  it('strips the username filter for users without see.others_transactions', async () => {
    // Owner records a sale (owner is the api wrapper user).
    const product = (await api.post('/api/products').send({ name: 'OwnerSold', buying_price: 5, selling_price: 10, category_id: 1, brand_id: 1, quantity: 5 })).body;
    await api.post('/api/transactions').send({ type: 'sale', items: [{ product_id: product.id, quantity: 1 }] });

    // The clerk filters by a username that isn't theirs; the filter is ignored,
    // so they still see all transactions rather than an empty set.
    const filtered = await asClerk('get', '/api/transactions').query({ username: '__nobody__' });
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThan(0);
  });
});

describe('migration backfills capabilities for pre-existing users', () => {
  let db, cleanup;

  beforeAll(async () => {
    ({ db, cleanup } = await setupTestApp());
  });
  afterAll(() => cleanup());

  it('admins get the full catalog and staff get their prior effective access', async () => {
    const { migrate } = await import('../db/migrate.js');
    const hash = bcrypt.hashSync('pass123', 10);
    // Simulate rows created before the permissions column existed by blanking it.
    db.prepare("INSERT INTO users (username, password_hash, role, permissions) VALUES ('legacy_admin', ?, 'admin', '[]')").run(hash);
    db.prepare("INSERT INTO users (username, password_hash, role, permissions) VALUES ('legacy_staff', ?, 'staff', '[]')").run(hash);
    db.exec("UPDATE users SET permissions = '[]' WHERE username IN ('legacy_admin','legacy_staff')");

    // Drop the column to force the migration's add+backfill branch to run again.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('ALTER TABLE users DROP COLUMN permissions');
    db.exec('PRAGMA foreign_keys = ON');
    migrate();

    const admin = db.prepare("SELECT permissions FROM users WHERE username = 'legacy_admin'").get();
    const staff = db.prepare("SELECT permissions FROM users WHERE username = 'legacy_staff'").get();
    expect(JSON.parse(admin.permissions)).toEqual(CAPABILITIES);
    expect(JSON.parse(staff.permissions)).toEqual([
      'see.activity_log', 'txn.sale', 'txn.service', 'txn.expense', 'txn.return',
      'inventory.view', 'inventory.edit', 'services.manage', 'lists.manage',
    ]);
  });
});
