import { Router } from 'express';
import { categories, brands } from '../repositories/reference.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const canManage = requirePermission('lists.manage');

// Builds an identical CRUD router for a reference repo (categories / brands).
function makeRouter(repo, { createAction, updateAction, deleteAction }) {
  const router = Router();
  router.get('/', (req, res) => res.json(repo.list()));
  router.post('/', canManage, (req, res) => {
    const result = repo.create(req.body);
    logActivity({ userId: req.user.id, username: req.user.username, action: createAction, entity: createAction.replace('create_', ''), entityId: result.id, detail: { name_en: result.name_en, name_ar: result.name_ar } });
    res.status(201).json(result);
  });
  router.put('/:id', canManage, (req, res) => {
    const id = Number(req.params.id);
    const updated = repo.update(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    logActivity({ userId: req.user.id, username: req.user.username, action: updateAction, entity: updateAction.replace('update_', ''), entityId: id, detail: { name_en: updated.name_en, name_ar: updated.name_ar } });
    res.json(updated);
  });
  router.delete('/:id', canManage, (req, res) => {
    // Optional ?moveTo=<id> reassigns products to that record before deleting.
    const moveTo = req.query.moveTo != null && req.query.moveTo !== '' ? Number(req.query.moveTo) : null;
    const id = Number(req.params.id);
    const record = repo.getById(id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    repo.remove(id, moveTo);
    logActivity({ userId: req.user.id, username: req.user.username, action: deleteAction, entity: deleteAction.replace('delete_', ''), entityId: id, detail: { name_en: record.name_en, name_ar: record.name_ar } });
    res.status(204).end();
  });
  return router;
}

export const categoriesRouter = makeRouter(categories, {
  createAction: 'create_category',
  updateAction: 'update_category',
  deleteAction: 'delete_category',
});
export const brandsRouter = makeRouter(brands, {
  createAction: 'create_brand',
  updateAction: 'update_brand',
  deleteAction: 'delete_brand',
});
