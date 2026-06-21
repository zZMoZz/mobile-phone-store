import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as users from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

// All routes require auth + admin
router.use(authenticate, requireAdmin);

router.get('/', (req, res, next) => {
  try { res.json(users.list()); } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const { username, password, role } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'Password required', code: 'user_password_required' });
    const password_hash = bcrypt.hashSync(password, 10);
    const user = users.create({ username, password_hash, role });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'create_user', entity: 'user', entityId: user.id });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

router.put('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { username, password, role } = req.body ?? {};
    const patch = {};
    if (username !== undefined) patch.username = username;
    if (role !== undefined) patch.role = role;
    if (password) patch.password_hash = bcrypt.hashSync(password, 10);
    const user = users.update(id, patch);
    logActivity({ userId: req.user.id, username: req.user.username, action: 'update_user', entity: 'user', entityId: id });
    res.json(user);
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    users.remove(id);
    logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_user', entity: 'user', entityId: id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
