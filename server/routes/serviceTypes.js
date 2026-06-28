import { Router } from 'express';
import * as serviceTypes from '../repositories/serviceTypes.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();
const canManage = requirePermission('services.manage');

router.get('/', (req, res) => res.json(serviceTypes.list()));

router.post('/', canManage, (req, res) => {
  const result = serviceTypes.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_service_type', entity: 'service_type', entityId: result.id, detail: { name_en: result.name_en, name_ar: result.name_ar } });
  res.status(201).json(result);
});

router.put('/:id', canManage, (req, res) => {
  const updated = serviceTypes.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_service_type', entity: 'service_type', entityId: Number(req.params.id), detail: { name_en: updated.name_en, name_ar: updated.name_ar } });
  res.json(updated);
});

router.delete('/:id', canManage, (req, res) => {
  const id = Number(req.params.id);
  const serviceType = serviceTypes.getById(id);
  if (!serviceType) return res.status(404).json({ error: 'Not found' });
  serviceTypes.remove(id);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_service_type', entity: 'service_type', entityId: id, detail: { name_en: serviceType.name_en, name_ar: serviceType.name_ar } });
  res.status(204).end();
});

export default router;
