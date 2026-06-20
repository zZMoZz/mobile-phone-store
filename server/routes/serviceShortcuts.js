import { Router } from 'express';
import * as shortcuts from '../repositories/serviceShortcuts.js';

const router = Router();

router.get('/', (req, res) => res.json(shortcuts.list(req.query.service_id ?? null)));
router.post('/', (req, res) => res.status(201).json(shortcuts.create(req.body)));
router.put('/:id', (req, res) => {
  const updated = shortcuts.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const ok = shortcuts.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
