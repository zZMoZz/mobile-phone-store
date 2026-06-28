import { userHas } from '../lib/permissions.js';

/**
 * Express middleware guarding a route by capability.
 * Pass a single string or an array — the user must hold at least one (OR).
 */
export function requirePermission(cap) {
  const caps = Array.isArray(cap) ? cap : [cap];
  return (req, res, next) => {
    if (caps.some((c) => userHas(req.user, c))) return next();
    return res.status(403).json({ error: 'Forbidden', code: 'auth_forbidden' });
  };
}
