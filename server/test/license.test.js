import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { generateKey, validateKey } from '../lib/license.js';

const { privateKey: TEST_PRIV, publicKey: TEST_PUB } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('license lib', () => {
  it('generateKey returns a non-empty base64 string', () => {
    const key = generateKey('some-machine-id', TEST_PRIV);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
    expect(() => Buffer.from(key, 'base64')).not.toThrow();
  });

  it('validateKey accepts the correct key for a machine', () => {
    const id = 'test-machine-abc';
    const key = generateKey(id, TEST_PRIV);
    expect(validateKey(id, key, TEST_PUB)).toBe(true);
  });

  it('validateKey rejects a key generated for a different machine', () => {
    const key = generateKey('machine-b', TEST_PRIV);
    expect(validateKey('machine-a', key, TEST_PUB)).toBe(false);
  });

  it('validateKey rejects null', () => {
    expect(validateKey('machine-a', null, TEST_PUB)).toBe(false);
  });

  it('validateKey rejects empty string', () => {
    expect(validateKey('machine-a', '', TEST_PUB)).toBe(false);
  });

  it('validateKey rejects garbage', () => {
    expect(validateKey('machine-a', 'not-a-valid-signature', TEST_PUB)).toBe(false);
  });
});
