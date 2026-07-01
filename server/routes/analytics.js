import { Router } from 'express';
import { overview, lowStockList } from '../repositories/analytics.js';

const router = Router();

router.get('/', (req, res) => res.json(overview(req.query)));

router.get('/low-stock', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  res.json(lowStockList({ page, pageSize }));
});

export default router;
