import { Router } from 'express';
import * as optionLists from '../repositories/optionLists.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();
const canManage = requirePermission('lists.manage');

router.get('/', (req, res) => res.json(optionLists.list()));
router.post('/', canManage, (req, res) => {
  const result = optionLists.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_option_list', entity: 'option_list', entityId: result.id });
  res.status(201).json(result);
});
router.put('/:id', canManage, (req, res) => {
  const updated = optionLists.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_option_list', entity: 'option_list', entityId: Number(req.params.id) });
  res.json(updated);
});
router.delete('/:id', canManage, (req, res) => {
  const id = Number(req.params.id);
  const ok = optionLists.remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_option_list', entity: 'option_list', entityId: id });
  res.status(204).end();
});

export default router;
