const jwt = require('../utils/jwt');

const bearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

// Verifies "Authorization: Bearer <token>" and sets req.studentId.
const requireAuth = (req, res, next) => {
  const payload = jwt.verify(bearer(req));
  if (!payload || !payload.sub) return res.status(401).json({ error: 'invalid token' });

  req.studentId = payload.sub;
  next();
};

// Admin-only gate. Fails closed: any token without role === 'admin' is rejected.
const requireAdmin = (req, res, next) => {
  const payload = jwt.verify(bearer(req));
  if (!payload || payload.role !== 'admin') return res.status(401).json({ error: 'invalid token' });

  req.adminId = payload.sub;
  next();
};

module.exports = requireAuth;
module.exports.requireAdmin = requireAdmin;
