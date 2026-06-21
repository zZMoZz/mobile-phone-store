import { Router } from 'express';
import * as shortcuts from '../repositories/serviceShortcuts.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

router.get('/', (req, res) => res.json(shortcuts.list(req.query.service_id ?? null)));
router.post('/', (req, res) => {
  const result = shortcuts.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_shortcut', entity: 'shortcut', entityId: result.id });
  res.status(201).json(result);
});
router.put('/:id', (req, res) => {
  const updated = shortcuts.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_shortcut', entity: 'shortcut', entityId: Number(req.params.id) });
  res.json(updated);
});
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = shortcuts.remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_shortcut', entity: 'shortcut', entityId: id });
  res.status(204).end();
});

export default router;
