import { Router } from 'express';
import { getMachineId } from '../lib/machine.js';
import { validateKey, writeKey } from '../lib/license.js';

const router = Router();

router.post('/activate', (req, res) => {
  const { key } = req.body;
  if (!key) return res.json({ ok: false, error: 'No key provided' });

  let machineId;
  try {
    machineId = getMachineId();
  } catch (e) {
    return res.json({ ok: false, error: 'Cannot read machine ID' });
  }

  if (!validateKey(machineId, key)) {
    return res.json({ ok: false, error: 'Invalid license key' });
  }

  writeKey(key);
  res.json({ ok: true });
});

export default router;
