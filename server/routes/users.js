import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getById, list, create, updateFields, incrementTokenVersion } from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

// GET / — admin or owner only
router.get('/', requireAdmin, (req, res, next) => {
  try { res.json(list()); } catch (err) { next(err); }
});

// POST / — admin creates staff only; owner creates admin or staff
router.post('/', requireAdmin, (req, res, next) => {
  try {
    const { username, display_name, password, role } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'Password required', code: 'user_password_required' });
    if (req.user.role === 'admin' && role !== 'staff') {
      return res.status(403).json({ error: 'Admins can only create staff users', code: 'auth_forbidden' });
    }
    const password_hash = bcrypt.hashSync(password, 10);
    const user = create({ username, display_name, password_hash, role, force_password_change: 1 });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'create_user', entity: 'user', entityId: user.id });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PUT /:id — any authenticated user; handler enforces permission matrix
router.put('/:id', (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const callerRole = req.user.role;
    const callerId = req.user.id;
    const isSelf = callerId === targetId;

    const target = getById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });

    const { display_name, role, status, password } = req.body ?? {};
    const patch = {};
    let needsInvalidation = false;

    // display_name — self always allowed; admin/owner may edit non-admin users; owner may edit admins
    if (display_name !== undefined) {
      const allowed =
        isSelf ||
        callerRole === 'owner' ||
        (callerRole === 'admin' && target.role === 'staff');
      if (!allowed) return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      patch.display_name = display_name?.trim() || null;
    }

    // role — admin can change staff role (staff↔admin); owner can change any non-owner role
    if (role !== undefined) {
      if (!['admin', 'staff'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or staff', code: 'user_role_invalid' });
      }
      if (target.role === 'owner') {
        return res.status(403).json({ error: 'Cannot change the owner role', code: 'auth_forbidden' });
      }
      if (callerRole === 'admin') {
        // Admin may only change role of staff users (promote to admin or back to staff)
        if (target.role !== 'staff' && role !== 'staff') {
          return res.status(403).json({ error: 'Admins cannot edit other admins\' roles', code: 'auth_forbidden' });
        }
      } else if (callerRole !== 'owner') {
        return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      }
      patch.role = role;
    }

    // status — admin can toggle staff; owner can toggle admin/staff; nobody disables self or owner
    if (status !== undefined) {
      if (!['ACTIVE', 'DISABLED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status', code: 'user_status_invalid' });
      }
      if (isSelf) return res.status(400).json({ error: 'Cannot change your own status', code: 'user_cannot_disable_self' });
      if (target.role === 'owner') return res.status(403).json({ error: 'Cannot disable the owner account', code: 'auth_forbidden' });
      if (target.role === 'admin' && callerRole !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can change admin status', code: 'auth_owner_only' });
      }
      if (target.role === 'staff' && !['admin', 'owner'].includes(callerRole)) {
        return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      }
      patch.status = status;
      if (status === 'DISABLED') needsInvalidation = true;
    }

    // password reset — admin resets staff; owner resets admin or staff; never self via this route
    if (password !== undefined) {
      if (isSelf) {
        return res.status(400).json({ error: 'Use /api/auth/change-password to change your own password', code: 'auth_use_change_password' });
      }
      if (target.role === 'owner') {
        return res.status(403).json({ error: 'Cannot reset the owner password via this route', code: 'auth_forbidden' });
      }
      if (target.role === 'admin' && callerRole !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can reset admin passwords', code: 'auth_owner_only' });
      }
      if (target.role === 'staff' && !['admin', 'owner'].includes(callerRole)) {
        return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      }
      patch.password_hash = bcrypt.hashSync(password, 10);
      patch.force_password_change = 1;
      needsInvalidation = true;
    }

    if (Object.keys(patch).length > 0) {
      updateFields(targetId, patch);
    }
    if (needsInvalidation) {
      incrementTokenVersion(targetId);
    }

    logActivity({ userId: callerId, username: req.user.username, action: 'update_user', entity: 'user', entityId: targetId });
    res.json(getById(targetId));
  } catch (err) { next(err); }
});

export default router;
