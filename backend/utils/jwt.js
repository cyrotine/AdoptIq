const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment');
}

const sign = (studentId) =>
  jwt.sign({ sub: studentId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Returns the student_id, or null if the token is invalid/expired.
const verify = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET).sub;
  } catch {
    return null;
  }
};

module.exports = { sign, verify };
