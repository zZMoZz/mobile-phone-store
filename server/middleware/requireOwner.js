export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner only', code: 'auth_owner_only' });
  }
  next();
}
