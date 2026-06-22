import { verifyToken } from '../lib/auth.js';
import { getById } from '../repositories/users.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'auth_required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    const user = getById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session', code: 'auth_invalid' });
    }
    if (user.status === 'DISABLED') {
      return res.status(401).json({ error: 'Account disabled', code: 'auth_disabled' });
    }
    if (user.token_version !== payload.tv) {
      return res.status(401).json({ error: 'Session invalidated', code: 'auth_invalid' });
    }
    req.user = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      force_password_change: user.force_password_change,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'auth_invalid' });
  }
}
