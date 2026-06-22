import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestApp } from './helpers.js';

describe('auth routes', () => {
  let app, db, api, cleanup;

  beforeAll(async () => {
    ({ app, db, api, cleanup } = await setupTestApp());
  });
  afterAll(() => cleanup());

  it('login succeeds with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.force_password_change).toBe(true);
    expect(res.body.user.role).toBe('owner');
  });

  it('login rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth_invalid_credentials');
  });

  it('login rejects disabled account', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, status) VALUES ('disabled_staff', ?, 'staff', 'DISABLED')").run(hash);
    const res = await request(app).post('/api/auth/login').send({ username: 'disabled_staff', password: 'pass123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth_disabled');
  });

  it('authenticate rejects token with wrong token_version', async () => {
    const { signToken } = await import('../lib/auth.js');
    const badToken = signToken({ sub: 1, username: 'admin', display_name: null, role: 'owner', tv: 9999 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth_invalid');
  });

  it('force-change-password rejects when not needed', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('noforce_staff', ?, 'staff', 0)").run(hash);
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'noforce_staff', password: 'pass123' });
    const staffToken = loginRes.body.token;
    const res2 = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ new_password: 'newpass123' });
    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe('auth_no_force_change');
  });

  it('force-change-password succeeds and returns recovery_code for admin/owner', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    const ownerToken = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ new_password: 'newpass456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.force_password_change).toBe(false);
    expect(res.body.recovery_code).toHaveLength(20);
  });

  it('force-change-password does not return recovery_code for staff', async () => {
    const hash = bcrypt.hashSync('pass123', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, force_password_change) VALUES ('forcestaff', ?, 'staff', 1)").run(hash);
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'forcestaff', password: 'pass123' });
    const staffToken = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ new_password: 'newpass789' });
    expect(res.status).toBe(200);
    expect(res.body.recovery_code).toBeNull();
  });

  it('change-password rejects wrong current password', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'newpass456' });
    const newToken = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${newToken}`)
      .send({ current_password: 'wrongpass', new_password: 'anotherpass' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('auth_wrong_password');
  });

  it('change-password succeeds with correct current password', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'newpass456' });
    const token = loginRes.body.token;
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'newpass456', new_password: 'finalpass789' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('recover rejects with wrong recovery code', async () => {
    const res = await request(app).post('/api/auth/recover').send({
      username: 'admin',
      recovery_code: 'aaaaaaaaaaaaaaaaaaaaaa',
      new_password: 'newpass111',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('auth_recover_invalid');
  });
});
