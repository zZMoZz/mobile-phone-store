import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logActivity } from '../repositories/activityLogs.js';
import * as settings from '../repositories/settings.js';

const router = Router();

router.get('/', (req, res) => res.json(settings.get()));

router.put('/', authenticate, requireAdmin, (req, res) => {
  const result = settings.update(req.body);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_settings' });
  res.json(result);
});

export default router;
