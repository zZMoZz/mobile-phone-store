import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestApp } from './helpers.js';

describe('users permission matrix', () => {
  let app, db, api, cleanup;
  let staffToken, adminToken;

  beforeAll(async () => {
    ({ app, db, api, cleanup } = await setupTestApp());

    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('test_admin', ?, 'admin', 0)").run(hash);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('test_staff', ?, 'staff', 0)").run(hash);

    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'test_admin', password: 'pass123' });
    adminToken = adminLogin.body.token;
    const staffLogin = await request(app).post('/api/auth/login').send({ username: 'test_staff', password: 'pass123' });
    staffToken = staffLogin.body.token;
  });
  afterAll(() => cleanup());

  it('admin can create staff', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'new_staff', display_name: 'New Staff', password: 'pass123', role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('staff');
  });

  it('admin cannot create admin', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'new_admin2', password: 'pass123', role: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('auth_forbidden');
  });

  it('staff cannot create users', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ username: 'another', password: 'pass123', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('staff can update own display_name', async () => {
    const staffRow = db.prepare("SELECT id FROM users WHERE username = 'test_staff'").get();
    const res = await request(app)
      .put(`/api/users/${staffRow.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ display_name: 'My Display Name' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('My Display Name');
  });

  it('admin cannot reset another admin password', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('test_admin2', ?, 'admin', 0)").run(hash);
    const admin2Row = db.prepare("SELECT id FROM users WHERE username = 'test_admin2'").get();
    const res = await request(app)
      .put(`/api/users/${admin2Row.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'newpass123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('auth_owner_only');
  });

  it('disabling a user invalidates their sessions', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('to_disable', ?, 'staff', 0)").run(hash);
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'to_disable', password: 'pass123' });
    const victimToken = loginRes.body.token;
    const victimId = loginRes.body.user.id;

    await request(app)
      .put(`/api/users/${victimId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED' });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(meRes.status).toBe(401);
  });

  it('nobody can disable their own account', async () => {
    const adminRow = db.prepare("SELECT id FROM users WHERE username = 'test_admin'").get();
    const res = await request(app)
      .put(`/api/users/${adminRow.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('user_cannot_disable_self');
  });
});
