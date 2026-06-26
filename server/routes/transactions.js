import { Router } from 'express';
import * as transactions from '../repositories/transactions.js';
import { logActivity } from '../repositories/activityLogs.js';
import { userHas } from '../lib/permissions.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();

// Which capability a given transaction type requires to be recorded. Unknown
// types are left unmapped so they fall through to the repository's validation
// (which returns a 400) rather than being masked as a 403.
const TXN_CAP = {
  sale: 'txn.sale',
  service: 'txn.service',
  expense: 'txn.expense',
  return: 'txn.return',
  purchase: 'inventory.edit', // recording stock-in
};

router.get('/', (req, res) => {
  const query = { ...req.query };
  if (query.username && !userHas(req.user, 'see.others_transactions')) {
    delete query.username;
  }
  res.json(transactions.list(query));
});

router.get('/:id', (req, res) => {
  const txn = transactions.getById(Number(req.params.id));
  if (!txn) return res.status(404).json({ error: 'Not found' });
  res.json(txn);
});

router.post('/:id/void', requirePermission('txn.void'), (req, res) => {
  const result = transactions.voidTransaction(Number(req.params.id), req.user.id);
  res.json(result);
});

router.post('/', (req, res) => {
  const cap = TXN_CAP[req.body?.type];
  // Known type the caller lacks the capability for → forbidden. Unknown types
  // fall through so the repository can reject them with a 400.
  if (cap && !userHas(req.user, cap)) {
    return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
  }
  const result = transactions.create(req.body, req.user);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'record_transaction', entity: 'transaction', entityId: result.id, detail: { type: result.type } });
  res.status(201).json(result);
});

export default router;
