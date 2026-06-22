import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as users from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

// All routes require admin (auth handled by global middleware)
router.use(requireAdmin);

router.get('/', (req, res, next) => {
  try { res.json(users.list()); } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const { username, display_name, password, role } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'Password required', code: 'user_password_required' });
    const password_hash = bcrypt.hashSync(password, 10);
    const user = users.create({ username, display_name, password_hash, role });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'create_user', entity: 'user', entityId: user.id });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PUT /:id — stub until Task 5 rewrites this route
router.put('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { display_name, password, role, status, force_password_change } = req.body ?? {};
    const patch = {};
    if (display_name !== undefined) patch.display_name = display_name;
    if (role !== undefined) patch.role = role;
    if (status !== undefined) patch.status = status;
    if (force_password_change !== undefined) patch.force_password_change = force_password_change;
    if (password) patch.password_hash = bcrypt.hashSync(password, 10);
    const user = users.updateFields(id, patch);
    logActivity({ userId: req.user.id, username: req.user.username, action: 'update_user', entity: 'user', entityId: id });
    res.json(user);
  } catch (err) { next(err); }
});

// DELETE /:id — stub until Task 5 rewrites this route
router.delete('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Disable instead of hard-delete (Task 5 will implement proper logic)
    users.updateFields(id, { status: 'DISABLED' });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_user', entity: 'user', entityId: id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
