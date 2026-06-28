import { Router } from 'express';
import * as services from '../repositories/services.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();
const canManage = requirePermission('services.manage');

router.get('/', (req, res) => res.json(services.list()));
router.post('/', canManage, (req, res) => {
  const result = services.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_service', entity: 'service', entityId: result.id, detail: { name_en: result.name_en, name_ar: result.name_ar } });
  res.status(201).json(result);
});
router.put('/:id', canManage, (req, res) => {
  const updated = services.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_service', entity: 'service', entityId: Number(req.params.id), detail: { name_en: updated.name_en, name_ar: updated.name_ar } });
  res.json(updated);
});
router.delete('/:id', canManage, (req, res) => {
  const id = Number(req.params.id);
  const service = services.getById(id);
  if (!service) return res.status(404).json({ error: 'Not found' });
  services.remove(id);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_service', entity: 'service', entityId: id, detail: { name_en: service.name_en, name_ar: service.name_ar } });
  res.status(204).end();
});

export default router;
