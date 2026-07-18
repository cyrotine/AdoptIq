// Self-check for the accept-dedup normalize() helper (spec 14). No DB, no network
// — plain node/assert. The DB paths (accept insert, 409/404/finished, link row)
// are exercised via curl. Run: node backend/services/session.accept.test.js
const assert = require('assert');
// normalize() is pure string work and makes no network/DB call, but importing it
// pulls session.service's AI chain, which checks the Gemini/Groq keys at load.
// Stub them so the pure self-check runs without real keys — nothing here calls out.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-stub';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-stub';
const { normalize } = require('./session.service');

// Case- and whitespace-different texts are the SAME question (dedup catches them).
assert.strictEqual(
  normalize('  What  is\tthe\ncapital? '),
  normalize('what is the capital?'),
  'case/whitespace differences normalize to equal',
);
assert.strictEqual(normalize('A   B  C'), 'a b c', 'internal whitespace collapses');

// Genuinely different texts stay distinct.
assert.notStrictEqual(
  normalize('What is 2 + 2?'),
  normalize('What is 3 + 3?'),
  'different questions stay distinct',
);

console.log('session.accept.test.js: all assertions passed');
