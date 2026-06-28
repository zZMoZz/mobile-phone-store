import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db/paths.js';

// Public key — verifies licenses but cannot generate them.
// The matching private key lives only on the developer's machine.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEUvc6KykxSv6K9I6xGE24tNoleuIN
uimblvapZpxU30Hyeqk/gzTDuIzRNz9+7XpMlQNvsi9M1AbJs8ARhELtGw==
-----END PUBLIC KEY-----`;

export function generateKey(machineId, privateKey) {
  const sign = crypto.createSign('SHA256');
  sign.update(machineId);
  return sign.sign(privateKey, 'base64');
}

export function validateKey(machineId, licenseKey, publicKey) {
  if (!licenseKey || typeof licenseKey !== 'string') return false;
  try {
    const pubKey = publicKey || process.env.LICENSE_PUBLIC_KEY || PUBLIC_KEY;
    const verify = crypto.createVerify('SHA256');
    verify.update(machineId);
    return verify.verify(pubKey, licenseKey, 'base64');
  } catch {
    return false;
  }
}

export function readStoredKey() {
  const licensePath = process.env.STORE_LICENSE_PATH || path.join(DATA_DIR, 'license.key');
  try {
    return fs.readFileSync(licensePath, 'utf8').trim();
  } catch {
    return null;
  }
}

export function writeKey(key) {
  const licensePath = process.env.STORE_LICENSE_PATH || path.join(DATA_DIR, 'license.key');
  fs.writeFileSync(licensePath, key, 'utf8');
}
