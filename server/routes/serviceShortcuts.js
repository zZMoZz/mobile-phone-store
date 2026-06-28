import { Router } from 'express';
import * as shortcuts from '../repositories/serviceShortcuts.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();
const canManage = requirePermission('services.manage');

router.get('/', (req, res) => res.json(shortcuts.list(req.query.service_id ?? null)));
router.post('/', canManage, (req, res) => {
  const result = shortcuts.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_shortcut', entity: 'shortcut', entityId: result.id, detail: { label_en: result.label_en, label_ar: result.label_ar } });
  res.status(201).json(result);
});
router.put('/:id', canManage, (req, res) => {
  const updated = shortcuts.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_shortcut', entity: 'shortcut', entityId: Number(req.params.id), detail: { label_en: updated.label_en, label_ar: updated.label_ar } });
  res.json(updated);
});
router.delete('/:id', canManage, (req, res) => {
  const id = Number(req.params.id);
  const shortcut = shortcuts.getById(id);
  if (!shortcut) return res.status(404).json({ error: 'Not found' });
  shortcuts.remove(id);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_shortcut', entity: 'shortcut', entityId: id, detail: { label_en: shortcut.label_en, label_ar: shortcut.label_ar } });
  res.status(204).end();
});

export default router;
