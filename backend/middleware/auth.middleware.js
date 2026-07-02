const jwt = require('../utils/jwt');

// Verifies "Authorization: Bearer <token>" and sets req.studentId.
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const studentId = token && jwt.verify(token);

  if (!studentId) return res.status(401).json({ error: 'invalid token' });

  req.studentId = studentId;
  next();
};

module.exports = requireAuth;
