import { Router } from 'express';
import { listActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();

router.get('/', requirePermission('see.activity_log'), (req, res, next) => {
  try {
    const { from, to, action, page, pageSize } = req.query;
    const userId = req.query.userId;
    res.json(listActivity({ from, to, action, userId, page, pageSize }));
  } catch (err) { next(err); }
});

export default router;
