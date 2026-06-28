import { execSync } from 'node:child_process';

let _cached = null;

export function getMachineId() {
  if (_cached) return _cached;
  if (process.platform !== 'win32') throw new Error('Windows is required to run this application');
  const output = execSync(
    'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
    { encoding: 'utf8', timeout: 5000 }
  );
  const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
  if (!match) throw new Error('MachineGuid not found in Windows registry');
  _cached = match[1].trim().toLowerCase();
  return _cached;
}
