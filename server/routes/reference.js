import { Router } from 'express';
import { categories, brands } from '../repositories/reference.js';
import { logActivity } from '../repositories/activityLogs.js';

// Builds an identical CRUD router for a reference repo (categories / brands).
function makeRouter(repo, { createAction, updateAction, deleteAction }) {
  const router = Router();
  router.get('/', (req, res) => res.json(repo.list()));
  router.post('/', (req, res) => {
    const result = repo.create(req.body);
    logActivity({ userId: req.user.id, username: req.user.username, action: createAction, entity: createAction.replace('create_', ''), entityId: result.id });
    res.status(201).json(result);
  });
  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const updated = repo.update(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    logActivity({ userId: req.user.id, username: req.user.username, action: updateAction, entity: updateAction.replace('update_', ''), entityId: id });
    res.json(updated);
  });
  router.delete('/:id', (req, res) => {
    // Optional ?moveTo=<id> reassigns products to that record before deleting.
    const moveTo = req.query.moveTo != null && req.query.moveTo !== '' ? Number(req.query.moveTo) : null;
    const id = Number(req.params.id);
    const ok = repo.remove(id, moveTo);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    logActivity({ userId: req.user.id, username: req.user.username, action: deleteAction, entity: deleteAction.replace('delete_', ''), entityId: id });
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
