import { Router } from 'express';
import * as transactions from '../repositories/transactions.js';
import { logActivity } from '../repositories/activityLogs.js';

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
  const result = transactions.create(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'record_transaction', entity: 'transaction', entityId: result.id, detail: { type: result.type } });
  res.status(201).json(result);
});

export default router;
