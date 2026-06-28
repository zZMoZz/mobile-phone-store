import { describe, it, expect } from 'vitest';
import { generateKey, validateKey } from '../lib/license.js';

describe('license lib', () => {
  it('generateKey returns a 64-char lowercase hex string', () => {
    const key = generateKey('some-machine-id');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validateKey accepts the correct key for a machine', () => {
    const id = 'test-machine-abc';
    expect(validateKey(id, generateKey(id))).toBe(true);
  });

  it('validateKey rejects a key generated for a different machine', () => {
    expect(validateKey('machine-a', generateKey('machine-b'))).toBe(false);
  });

  it('validateKey rejects null', () => {
    expect(validateKey('machine-a', null)).toBe(false);
  });

  it('validateKey rejects empty string', () => {
    expect(validateKey('machine-a', '')).toBe(false);
  });

  it('validateKey rejects non-hex garbage', () => {
    expect(validateKey('machine-a', 'not-a-hex-key')).toBe(false);
  });
});
