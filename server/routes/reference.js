import { Router } from 'express';
import { categories, brands } from '../repositories/reference.js';

// Builds an identical CRUD router for a reference repo (categories / brands).
function makeRouter(repo) {
  const router = Router();
  router.get('/', (req, res) => res.json(repo.list()));
  router.post('/', (req, res) => res.status(201).json(repo.create(req.body)));
  router.put('/:id', (req, res) => {
    const updated = repo.update(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });
  router.delete('/:id', (req, res) => {
    // Optional ?moveTo=<id> reassigns products to that record before deleting.
    const moveTo = req.query.moveTo != null && req.query.moveTo !== '' ? Number(req.query.moveTo) : null;
    const ok = repo.remove(Number(req.params.id), moveTo);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  });
  return router;
}

export const categoriesRouter = makeRouter(categories);
export const brandsRouter = makeRouter(brands);
