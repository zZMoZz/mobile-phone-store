import crypto from 'node:crypto';
import fs from 'node:fs';
import { LICENSE_PATH } from '../db/paths.js';

const SECRET_KEY = '4ec7a301e184f0739f94a9759944a75f6e017af8047f1dcd0c988e132e1ef6d4';

export function generateKey(machineId) {
  return crypto.createHmac('sha256', SECRET_KEY).update(machineId).digest('hex');
}

export function validateKey(machineId, key) {
  if (!key || typeof key !== 'string' || key.length !== 64) return false;
  try {
    const expected = Buffer.from(generateKey(machineId), 'hex');
    const provided = Buffer.from(key.toLowerCase(), 'hex');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function readStoredKey() {
  try {
    return fs.readFileSync(LICENSE_PATH, 'utf8').trim();
  } catch {
    return null;
  }
}

export function writeKey(key) {
  fs.writeFileSync(LICENSE_PATH, key, 'utf8');
}
