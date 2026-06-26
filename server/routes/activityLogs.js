import { Router } from 'express';
import { listActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { userHas } from '../lib/permissions.js';

const router = Router();

router.get('/', requirePermission('see.activity_log'), (req, res, next) => {
  try {
    const { from, to, action, page, pageSize } = req.query;
    // Filtering by a specific user is reserved for those who may see others' activity.
    const userId = userHas(req.user, 'see.others_transactions') ? req.query.userId : undefined;
    res.json(listActivity({ from, to, action, userId, page, pageSize }));
  } catch (err) { next(err); }
});

export default router;
