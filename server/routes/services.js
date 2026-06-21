import { Router } from 'express';
import * as services from '../repositories/services.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

router.get('/', (req, res) => res.json(services.list()));
router.post('/', (req, res) => {
  const result = services.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_service', entity: 'service', entityId: result.id });
  res.status(201).json(result);
});
router.put('/:id', (req, res) => {
  const updated = services.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_service', entity: 'service', entityId: Number(req.params.id) });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = services.remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_service', entity: 'service', entityId: id });
  res.status(204).end();
});

export default router;
