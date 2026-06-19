import { Router } from 'express';
import * as transactions from '../repositories/transactions.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(transactions.list(req.query));
});

router.get('/:id', (req, res) => {
  const txn = transactions.getById(Number(req.params.id));
  if (!txn) return res.status(404).json({ error: 'Not found' });
  res.json(txn);
});

router.post('/', (req, res) => {
  res.status(201).json(transactions.create(req.body));
});

export default router;
