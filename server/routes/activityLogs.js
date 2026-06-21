import { Router } from 'express';
import { listActivity } from '../repositories/activityLogs.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { from, to, action, userId, page, pageSize } = req.query;
    res.json(listActivity({ from, to, action, userId, page, pageSize }));
  } catch (err) { next(err); }
});

export default router;
