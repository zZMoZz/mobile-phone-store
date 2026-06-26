import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestApp } from './helpers.js';

// Capability model: the owner is the only account that may assign capabilities.
// A non-owner with the `users.manage` capability can create/disable/reset users
// but only as limited staff accounts, and can never grant capabilities.
describe('users capability model', () => {
  let app, db, api, cleanup;
  let managerToken;        // non-owner with users.manage
  let plainToken;          // non-owner with no users.manage

  const hash = bcrypt.hashSync('pass123', 10);
  const insertUser = (username, permissions) =>
    db.prepare(
      "INSERT INTO users (username, password_hash, role, permissions, force_password_change) VALUES (?, ?, 'staff', ?, 0)",
    ).run(username, hash, JSON.stringify(permissions)).lastInsertRowid;
  const loginToken = async (username) =>
    (await request(app).post('/api/auth/login').send({ username, password: 'pass123' })).body.token;

  beforeAll(async () => {
    ({ app, db, api, cleanup } = await setupTestApp());
    insertUser('mgr', ['users.manage']);
    insertUser('plain', ['txn.sale']);
    managerToken = await loginToken('mgr');
    plainToken = await loginToken('plain');
  });
  afterAll(() => cleanup());

  it('owner creates a staff user with the staff preset', async () => {
    const res = await api
      .post('/api/users')
      .send({ username: 'new_staff', display_name: 'New Staff', password: 'pass123', role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('staff');
    expect(res.body.permissions).toEqual(['txn.sale', 'txn.service', 'txn.expense', 'inventory.view']);
  });

  it('owner can create a user with custom capabilities (sanitized & ordered)', async () => {
    const res = await api
      .post('/api/users')
      .send({ username: 'custom', password: 'pass123', role: 'staff', permissions: ['users.manage', 'bogus', 'see.cost'] });
    expect(res.status).toBe(201);
    expect(res.body.permissions).toEqual(['see.cost', 'users.manage']); // catalog order, bogus dropped
  });

  it('a users.manage holder can create users but only the staff preset (no escalation)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ username: 'mgr_made', password: 'pass123', role: 'admin', permissions: ['users.manage', 'see.cost'] });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('staff'); // admin request downgraded
    expect(res.body.permissions).toEqual(['txn.sale', 'txn.service', 'txn.expense', 'inventory.view']);
  });

  it('a user without users.manage cannot create users', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ username: 'nope', password: 'pass123', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('only the owner can change a user\'s capabilities', async () => {
    const id = insertUser('cap_target', ['txn.sale']);

    // Manager (users.manage but not owner) is rejected.
    const denied = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ permissions: ['see.cost'] });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('auth_owner_only');

    // Owner succeeds.
    const ok = await api.put(`/api/users/${id}`).send({ permissions: ['see.cost', 'txn.sale'] });
    expect(ok.status).toBe(200);
    expect(ok.body.permissions).toEqual(['see.cost', 'txn.sale']);
  });

  it('changing capabilities invalidates the target\'s existing sessions', async () => {
    const id = insertUser('cap_session', ['txn.sale']);
    const victimToken = await loginToken('cap_session');

    await api.put(`/api/users/${id}`).send({ permissions: ['txn.sale', 'see.cost'] });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${victimToken}`);
    expect(me.status).toBe(401);
  });

  it('a user can update their own display_name without users.manage', async () => {
    const plainRow = db.prepare("SELECT id FROM users WHERE username = 'plain'").get();
    const res = await request(app)
      .put(`/api/users/${plainRow.id}`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ display_name: 'My Name' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('My Name');
  });

  it('a users.manage holder can reset a non-owner password but not the owner\'s', async () => {
    const id = insertUser('reset_me', ['txn.sale']);
    const ok = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ password: 'newpass123' });
    expect(ok.status).toBe(200);

    const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner'").get();
    const denied = await request(app)
      .put(`/api/users/${ownerRow.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ password: 'hax' });
    expect(denied.status).toBe(403);
  });

  it('disabling a user invalidates their sessions', async () => {
    const id = insertUser('to_disable', ['txn.sale']);
    const victimToken = await loginToken('to_disable');
    await api.put(`/api/users/${id}`).send({ status: 'DISABLED' });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${victimToken}`);
    expect(me.status).toBe(401);
  });

  it('nobody can disable their own account', async () => {
    const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner'").get();
    const res = await api.put(`/api/users/${ownerRow.id}`).send({ status: 'DISABLED' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('user_cannot_disable_self');
  });

  it('the owner account cannot be disabled by a manager', async () => {
    const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner'").get();
    const res = await request(app)
      .put(`/api/users/${ownerRow.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(403);
  });
});
