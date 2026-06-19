import { Router } from 'express';
import * as optionLists from '../repositories/optionLists.js';

const router = Router();

router.get('/', (req, res) => res.json(optionLists.list()));
router.post('/', (req, res) => res.status(201).json(optionLists.create(req.body)));
router.put('/:id', (req, res) => {
  const updated = optionLists.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const ok = optionLists.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
