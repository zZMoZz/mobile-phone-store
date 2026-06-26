import { Router } from 'express';
import { requirePermission } from '../middleware/requirePermission.js';
import { logActivity } from '../repositories/activityLogs.js';
import * as settings from '../repositories/settings.js';

const router = Router();

router.get('/', (req, res) => res.json(settings.get()));

router.put('/', requirePermission('settings.manage'), (req, res) => {
  const result = settings.update(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_settings' });
  res.json(result);
});

export default router;
