import { generateKey } from '../lib/license.js';

const machineId = process.argv[2];

if (!machineId) {
  console.error('\nUsage: npm run license -- <machineGuid>\n');
  console.error('Example: npm run license -- 6a2f3c1d-4b5e-6f7a-8b9c-0d1e2f3a4b5c\n');
  process.exit(1);
}

const key = generateKey(machineId.trim().toLowerCase());

console.log('');
console.log('Machine ID :', machineId);
console.log('License key:', key);
console.log('');
console.log('Send the license key above to the store owner.');
console.log('');
