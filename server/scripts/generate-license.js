import fs from 'node:fs';
import { generateKey } from '../lib/license.js';

const machineId = process.argv[2];
const keyFile = process.argv[3];

if (!machineId || !keyFile) {
  console.error('\nUsage: npm run license -- <machineGuid> <path-to-private.pem>\n');
  console.error('Example: npm run license -- 6a2f3c1d-4b5e-6f7a-8b9c-0d1e2f3a4b5c C:\\keys\\private.pem\n');
  process.exit(1);
}

if (!fs.existsSync(keyFile)) {
  console.error(`\nError: Key file not found: ${keyFile}\n`);
  process.exit(1);
}

const privateKey = fs.readFileSync(keyFile, 'utf8');
const key = generateKey(machineId.trim().toLowerCase(), privateKey);

console.log('');
console.log('Machine ID :', machineId);
console.log('License key:', key);
console.log('');
console.log('Send the license key above to the store owner.');
console.log('');
