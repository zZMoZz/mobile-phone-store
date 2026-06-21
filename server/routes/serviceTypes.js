import { Router } from 'express';
import * as serviceTypes from '../repositories/serviceTypes.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

router.get('/', (req, res) => res.json(serviceTypes.list()));

router.post('/', (req, res) => {
  const result = serviceTypes.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_service_type', entity: 'service_type', entityId: result.id });
  res.status(201).json(result);
});

router.put('/:id', (req, res) => {
  const updated = serviceTypes.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_service_type', entity: 'service_type', entityId: Number(req.params.id) });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = serviceTypes.remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_service_type', entity: 'service_type', entityId: id });
  res.status(204).end();
});

export default router;
