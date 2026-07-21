// Spec 15 self-check — run: node backend/utils/validate.test.js
const assert = require('assert');
const { validateGenerateMore, validateChatMessages } = require('./validate');

// validateGenerateMore: good input, optional target_elo, per-field rejects.
assert.strictEqual(validateGenerateMore({ count: 5, target_elo: 50 }), null);
assert.strictEqual(validateGenerateMore({ count: 5 }), null); // target_elo omitted
assert.ok(validateGenerateMore({ count: 0 }));
assert.ok(validateGenerateMore({ count: 21 }));
assert.ok(validateGenerateMore({ count: 2.5 }));
assert.ok(validateGenerateMore({ count: 5, target_elo: -1 }));
assert.ok(validateGenerateMore({ count: 5, target_elo: 101 }));

// validateChatMessages: good conversation, then per-rule rejects.
assert.strictEqual(
  validateChatMessages([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'more' }]),
  null,
);
assert.ok(validateChatMessages([]));            // empty
assert.ok(validateChatMessages('nope'));        // not an array
assert.ok(validateChatMessages([{ role: 'system', content: 'x' }]));   // bad role
assert.ok(validateChatMessages([{ role: 'user', content: '  ' }]));    // empty content
assert.ok(validateChatMessages([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }])); // last not user

console.log('validate.test.js: all assertions passed');
