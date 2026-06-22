import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../lib/auth.js';
import { authenticate } from '../middleware/authenticate.js';
import { findByUsername } from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';
import { runScheduledBackup } from '../lib/backup.js';

const router = Router();

// POST /api/auth/login — public
router.post('/login', (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required', code: 'auth_required' });
    }
    const user = findByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'auth_invalid_credentials' });
    }
    runScheduledBackup(); // fire-and-forget: backup before issuing the session
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    logActivity({ userId: user.id, username: user.username, action: 'login' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — authenticated
router.post('/logout', authenticate, (req, res, next) => {
  try {
    runScheduledBackup(); // fire-and-forget: capture end-of-session state
    logActivity({ userId: req.user.id, username: req.user.username, action: 'logout' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/me — authenticated
router.get('/me', authenticate, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

export default router;
