// Self-check for the JWT role payload (Spec 11). Guards the shape both auth
// middlewares depend on. DB-free. Run: node backend/utils/jwt.test.js
const assert = require('assert');

process.env.JWT_SECRET = 'test-secret';
const jwt = require('./jwt');

// Default sign is a student — the role claim exists and reads 'student'.
const studentPayload = jwt.verify(jwt.sign('student-123'));
assert.strictEqual(studentPayload.sub, 'student-123', 'sub preserved');
assert.strictEqual(studentPayload.role, 'student', 'default role is student');

// Admin sign carries role 'admin'.
const adminPayload = jwt.verify(jwt.sign('admin-456', 'admin'));
assert.strictEqual(adminPayload.sub, 'admin-456', 'admin sub preserved');
assert.strictEqual(adminPayload.role, 'admin', 'explicit role is admin');

// A garbage token verifies to null (fails closed).
assert.strictEqual(jwt.verify('not-a-token'), null, 'invalid token => null');

console.log('jwt role payload self-check passed');
