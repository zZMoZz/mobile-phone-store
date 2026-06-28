import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Mock machine.js so tests never touch the Windows registry.
vi.mock('../lib/machine.js', () => ({
  getMachineId: () => 'test-machine-uuid-1234',
}));

// Import after vi.mock is hoisted.
const { generateKey } = await import('../lib/license.js');
const { setupTestApp } = await import('./helpers.js');

describe('POST /api/license/activate', () => {
  let app, cleanup;

  beforeAll(async () => {
    process.env.STORE_LICENSE_PATH = path.join(os.tmpdir(), `lic-${randomUUID()}.key`);
    ({ app, cleanup } = await setupTestApp());
  });

  afterAll(() => {
    delete process.env.STORE_LICENSE_PATH;
    cleanup();
  });

  it('rejects missing key field', async () => {
    const res = await request(app).post('/api/license/activate').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('rejects an invalid key', async () => {
    const res = await request(app).post('/api/license/activate').send({ key: 'deadbeef'.repeat(8) });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  it('accepts the correct key for the mocked machine and writes the license', async () => {
    const key = generateKey('test-machine-uuid-1234');
    const res = await request(app).post('/api/license/activate').send({ key });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
