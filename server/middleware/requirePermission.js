import { userHas } from '../lib/permissions.js';

/** Express middleware guarding a route by a single capability key. */
export function requirePermission(cap) {
  return (req, res, next) => {
    if (userHas(req.user, cap)) return next();
    return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
  };
}
