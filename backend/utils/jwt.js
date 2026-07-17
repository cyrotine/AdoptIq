const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment');
}

// role defaults to 'student' so existing student sign(id) calls are unchanged.
const sign = (subject, role = 'student') =>
  jwt.sign({ sub: subject, role }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Returns the decoded { sub, role } payload, or null if invalid/expired.
const verify = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

module.exports = { sign, verify };
