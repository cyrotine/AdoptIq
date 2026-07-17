// Self-check for validateSessionCreate (spec 13). No DB, no network — plain
// node/assert. DB/network paths (embeddings, Groq, Supabase) are exercised via
// curl, not here. Run: node backend/utils/validate.session.test.js
const assert = require('assert');
const { validateSessionCreate } = require('./validate');

const good = { topic_id: 1, target_elo: 50, count: 5 };
assert.strictEqual(validateSessionCreate(good), null, 'well-formed request is accepted');
assert.strictEqual(validateSessionCreate({ topic_id: 3, target_elo: 0, count: 1 }), null, 'boundary values accepted');
assert.strictEqual(validateSessionCreate({ topic_id: 3, target_elo: 100, count: 20 }), null, 'upper boundary values accepted');

const bad = (overrides) => validateSessionCreate({ ...good, ...overrides });

assert.ok(bad({ topic_id: 0 }), 'zero topic_id rejected');
assert.ok(bad({ topic_id: -1 }), 'negative topic_id rejected');
assert.ok(bad({ topic_id: 2.5 }), 'non-integer topic_id rejected');
assert.ok(bad({ topic_id: NaN }), 'NaN topic_id rejected');

assert.ok(bad({ target_elo: -1 }), 'below-range target_elo rejected');
assert.ok(bad({ target_elo: 101 }), 'above-range target_elo rejected');
assert.ok(bad({ target_elo: 12.5 }), 'non-integer target_elo rejected');

assert.ok(bad({ count: 0 }), 'zero count rejected');
assert.ok(bad({ count: 21 }), 'above-cap count rejected');
assert.ok(bad({ count: 2.5 }), 'non-integer count rejected');

console.log('validate.session.test.js: all assertions passed');
