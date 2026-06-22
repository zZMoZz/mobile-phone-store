import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../lib/auth.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  findByUsername,
  getById,
  getByIdFull,
  updateFields,
  incrementTokenVersion,
  generateAndStoreRecoveryCode,
} from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';
import { runScheduledBackup } from '../lib/backup.js';

const router = Router();

function makeUserToken(user, tv) {
  return signToken({
    sub: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    tv,
  });
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    force_password_change: user.force_password_change === 1,
  };
}

// POST /api/auth/login — public
router.post('/login', (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required', code: 'auth_required' });
    }
    const user = findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'auth_invalid_credentials' });
    }
    if (user.status === 'DISABLED') {
      return res.status(401).json({ error: 'Account disabled', code: 'auth_disabled' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'auth_invalid_credentials' });
    }
    runScheduledBackup();
    const token = makeUserToken(user, user.token_version);
    logActivity({ userId: user.id, username: user.username, action: 'login' });
    res.json({ token, user: safeUser(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — authenticated
router.post('/logout', authenticate, (req, res, next) => {
  try {
    runScheduledBackup();
    logActivity({ userId: req.user.id, username: req.user.username, action: 'logout' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/me — authenticated
router.get('/me', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    display_name: req.user.display_name,
    role: req.user.role,
    force_password_change: req.user.force_password_change === 1,
  });
});

// POST /api/auth/force-change-password — authenticated, only when force_password_change is truthy
router.post('/force-change-password', authenticate, (req, res, next) => {
  try {
    if (!req.user.force_password_change) {
      return res.status(400).json({ error: 'No forced change pending', code: 'auth_no_force_change' });
    }
    const { new_password } = req.body ?? {};
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'auth_password_too_short' });
    }
    const password_hash = bcrypt.hashSync(new_password, 10);
    updateFields(req.user.id, { password_hash, force_password_change: 0 });
    const newTv = incrementTokenVersion(req.user.id);

    let recovery_code = null;
    if (['admin', 'owner'].includes(req.user.role)) {
      recovery_code = generateAndStoreRecoveryCode(req.user.id);
    }

    const user = getById(req.user.id);
    const token = makeUserToken(user, newTv);
    logActivity({ userId: user.id, username: user.username, action: 'force_change_password' });
    res.json({ token, user: safeUser(user), recovery_code });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password — authenticated, self-service (verifies current password)
router.post('/change-password', authenticate, (req, res, next) => {
  try {
    const { current_password, new_password } = req.body ?? {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Both passwords required', code: 'auth_passwords_required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'auth_password_too_short' });
    }
    const full = getByIdFull(req.user.id);
    if (!bcrypt.compareSync(current_password, full.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect', code: 'auth_wrong_password' });
    }
    const password_hash = bcrypt.hashSync(new_password, 10);
    updateFields(req.user.id, { password_hash });
    const newTv = incrementTokenVersion(req.user.id);
    const user = getById(req.user.id);
    const token = makeUserToken(user, newTv);
    logActivity({ userId: user.id, username: user.username, action: 'change_password' });
    res.json({ token, user: safeUser(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/recover — PUBLIC, admin/owner self-service password recovery
router.post('/recover', (req, res, next) => {
  try {
    const { username, recovery_code, new_password } = req.body ?? {};
    if (!username || !recovery_code || !new_password) {
      return res.status(400).json({ error: 'Username, recovery code, and new password required', code: 'auth_recover_fields_required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'auth_password_too_short' });
    }
    const user = findByUsername(username);
    const GENERIC_ERROR = { error: 'Invalid username or recovery code', code: 'auth_recover_invalid' };
    if (!user || !user.recovery_code_hash) {
      return res.status(400).json(GENERIC_ERROR);
    }
    if (!bcrypt.compareSync(recovery_code, user.recovery_code_hash)) {
      return res.status(400).json(GENERIC_ERROR);
    }
    const password_hash = bcrypt.hashSync(new_password, 10);
    updateFields(user.id, { password_hash, force_password_change: 0 });
    const newTv = incrementTokenVersion(user.id);
    const new_recovery_code = generateAndStoreRecoveryCode(user.id);
    const updatedUser = getById(user.id);
    const token = makeUserToken(updatedUser, newTv);
    logActivity({ userId: updatedUser.id, username: updatedUser.username, action: 'recover_password' });
    res.json({ token, user: safeUser(updatedUser), recovery_code: new_recovery_code });
  } catch (err) { next(err); }
});

export default router;
