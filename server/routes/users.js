import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requirePermission } from '../middleware/requirePermission.js';
import { getById, list, create, updateFields, incrementTokenVersion } from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';
import { PRESETS, sanitizePermissions } from '../lib/permissions.js';

const router = Router();

const canManageUsers = requirePermission('users.manage');
const isOwner = (req) => req.user.role === 'owner';

// GET /names — lightweight id+username list for filter dropdowns; activity-log viewers need this
router.get('/names', requirePermission('see.activity_log'), (req, res, next) => {
  try {
    res.json(list().map(({ id, username }) => ({ id, username })));
  } catch (err) { next(err); }
});

// GET / — anyone who can manage users
router.get('/', canManageUsers, (req, res, next) => {
  try { res.json(list()); } catch (err) { next(err); }
});

// POST / — create a user.
// The owner may pick any preset and tweak the exact capabilities. A delegated
// (non-owner) user-manager can only create limited "staff" accounts and cannot
// confer capabilities — assigning capabilities is owner-only, so they can't mint
// an account more powerful than themselves.
router.post('/', canManageUsers, (req, res, next) => {
  try {
    const { username, display_name, password } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'Password required', code: 'user_password_required' });

    let role = req.body?.role;
    let permissions;
    if (isOwner(req)) {
      if (!['admin', 'staff'].includes(role)) role = 'staff';
      permissions = Array.isArray(req.body?.permissions)
        ? sanitizePermissions(req.body.permissions)
        : (PRESETS[role] ?? []);
    } else {
      // Delegated manager: staff preset only, no custom capabilities.
      role = 'staff';
      permissions = [...PRESETS.staff];
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const user = create({ username, display_name, password_hash, role, permissions, force_password_change: 1 });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'create_user', entity: 'user', entityId: user.id, detail: { username: user.username, role: user.role } });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PUT /:id — field-level permission rules (self can edit own display name without
// the users.manage capability; everything else needs it; capabilities are owner-only).
router.put('/:id', (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const callerId = req.user.id;
    const isSelf = callerId === targetId;
    const canManage = req.user.permissions?.includes('users.manage') || isOwner(req);

    const target = getById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });

    const { username, display_name, role, status, password, permissions } = req.body ?? {};
    const patch = {};
    let needsInvalidation = false;

    // username — needs users.manage; never the owner target.
    if (username !== undefined) {
      if (!canManage) return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      if (target.role === 'owner') return res.status(403).json({ error: 'Cannot change the owner username', code: 'auth_forbidden' });
      patch.username = username;
    }

    // display_name — self always allowed; otherwise needs users.manage and a non-owner target.
    if (display_name !== undefined) {
      const allowed = isSelf || (canManage && target.role !== 'owner');
      if (!allowed) return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      patch.display_name = display_name?.trim() || null;
    }

    // role — owner-only, and only a cosmetic preset label (does not change capabilities).
    if (role !== undefined) {
      if (!isOwner(req)) return res.status(403).json({ error: 'Only the owner can change roles', code: 'auth_owner_only' });
      if (target.role === 'owner') return res.status(403).json({ error: 'Cannot change the owner role', code: 'auth_forbidden' });
      if (!['admin', 'staff'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or staff', code: 'user_role_invalid' });
      }
      patch.role = role;
    }

    // permissions — OWNER ONLY. Bumps token version so the change takes effect on next request.
    if (permissions !== undefined) {
      if (!isOwner(req)) return res.status(403).json({ error: 'Only the owner can change capabilities', code: 'auth_owner_only' });
      if (target.role === 'owner') return res.status(403).json({ error: 'The owner already has every capability', code: 'auth_forbidden' });
      patch.permissions = sanitizePermissions(permissions);
      needsInvalidation = true;
    }

    // status — needs users.manage; never self, never the owner.
    if (status !== undefined) {
      if (!['ACTIVE', 'DISABLED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status', code: 'user_status_invalid' });
      }
      if (!canManage) return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      if (isSelf) return res.status(400).json({ error: 'Cannot change your own status', code: 'user_cannot_disable_self' });
      if (target.role === 'owner') return res.status(403).json({ error: 'Cannot disable the owner account', code: 'auth_forbidden' });
      patch.status = status;
      if (status === 'DISABLED') needsInvalidation = true;
    }

    // password reset — needs users.manage; never self (use change-password); never the owner.
    if (password !== undefined) {
      if (!canManage) return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
      if (isSelf) {
        return res.status(400).json({ error: 'Use /api/auth/change-password to change your own password', code: 'auth_use_change_password' });
      }
      if (target.role === 'owner') {
        return res.status(403).json({ error: 'Cannot reset the owner password via this route', code: 'auth_forbidden' });
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

    const changes = {};
    if ('role' in patch) changes.role = patch.role;
    if ('status' in patch) changes.status = patch.status;
    if ('password_hash' in patch) changes.password_reset = true;
    if ('permissions' in patch) changes.permissions_updated = true;
    logActivity({ userId: callerId, username: req.user.username, action: 'update_user', entity: 'user', entityId: targetId, detail: { username: target.username, ...changes } });
    res.json(getById(targetId));
  } catch (err) { next(err); }
});

export default router;
