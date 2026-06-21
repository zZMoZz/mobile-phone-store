import { verifyToken } from '../lib/auth.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'auth_required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.user = { id: payload.sub, username: payload.username, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'auth_invalid' });
  }
}
