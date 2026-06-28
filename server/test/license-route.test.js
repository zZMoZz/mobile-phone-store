import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

vi.mock('../lib/machine.js', () => ({
  getMachineId: () => 'test-machine-uuid-1234',
}));

const { privateKey: TEST_PRIV, publicKey: TEST_PUB } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const { generateKey } = await import('../lib/license.js');
const { setupTestApp } = await import('./helpers.js');

describe('POST /api/license/activate', () => {
  let app, cleanup;

  beforeAll(async () => {
    process.env.STORE_LICENSE_PATH = path.join(os.tmpdir(), `lic-${randomUUID()}.key`);
    process.env.LICENSE_PUBLIC_KEY = TEST_PUB;
    ({ app, cleanup } = await setupTestApp());
  });

  afterAll(() => {
    delete process.env.STORE_LICENSE_PATH;
    delete process.env.LICENSE_PUBLIC_KEY;
    cleanup();
  });

  it('rejects missing key field', async () => {
    const res = await request(app).post('/api/license/activate').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('rejects an invalid key', async () => {
    const res = await request(app).post('/api/license/activate').send({ key: 'notavalidkey' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  it('accepts the correct key for the mocked machine and writes the license', async () => {
    const key = generateKey('test-machine-uuid-1234', TEST_PRIV);
    const res = await request(app).post('/api/license/activate').send({ key });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
