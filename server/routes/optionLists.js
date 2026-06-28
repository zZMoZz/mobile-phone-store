import { Router } from 'express';
import * as optionLists from '../repositories/optionLists.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();
const canManage = requirePermission(['lists.manage', 'services.manage']);

router.get('/', (req, res) => res.json(optionLists.list()));
router.post('/', canManage, (req, res) => {
  const result = optionLists.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_option_list', entity: 'option_list', entityId: result.id, detail: { name_en: result.name_en, name_ar: result.name_ar } });
  res.status(201).json(result);
});
router.put('/:id', canManage, (req, res) => {
  const updated = optionLists.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_option_list', entity: 'option_list', entityId: Number(req.params.id), detail: { name_en: updated.name_en, name_ar: updated.name_ar } });
  res.json(updated);
});
router.delete('/:id', canManage, (req, res) => {
  const id = Number(req.params.id);
  const optionList = optionLists.getById(id);
  if (!optionList) return res.status(404).json({ error: 'Not found' });
  optionLists.remove(id);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_option_list', entity: 'option_list', entityId: id, detail: { name_en: optionList.name_en, name_ar: optionList.name_ar } });
  res.status(204).end();
});

export default router;
