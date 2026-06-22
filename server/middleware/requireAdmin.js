export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Admin only', code: 'auth_forbidden' });
  }
  next();
}
