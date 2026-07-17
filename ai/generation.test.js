// Self-check for the pure pieces of the generation core (spec 12): the chunker
// overlap and validateGeneratedQuestion. No DB, no network, no framework —
// network paths (Groq) are exercised by the CLI, not here.
// Run: node ai/generation.test.js
const assert = require('assert');
const { chunkText } = require('./chunk');
const { validateGeneratedQuestion } = require('../backend/utils/validate');

// --- chunkText ---------------------------------------------------------------

assert.deepStrictEqual(chunkText(''), [], 'empty string yields no chunks');
assert.deepStrictEqual(chunkText('   \n\n  \t '), [], 'whitespace-only yields no chunks');

const words = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join(' ');
const twoParas = `${words(100, 'a')}\n\n${words(100, 'b')}`; // 200 words > 180 window
const chunks = chunkText(twoParas);
assert.strictEqual(chunks.length, 2, 'two ~100-word paragraphs split into two windows');
const tail = chunks[0].split(' ').slice(-30).join(' ');
assert.ok(chunks[1].startsWith(tail), 'second chunk begins with the ~30-word overlap tail of the first');

assert.strictEqual(chunkText('one two three\n\nfour five six').length, 1, 'short text fits in a single chunk');

// --- validateGeneratedQuestion ----------------------------------------------

const good = {
  question_text: 'What is 2 + 2?',
  option_a: '3', option_b: '4', option_c: '5', option_d: '6',
  correct_answer: 'B',
  explanation: '2 + 2 = 4.',
  elo_question: 30,
  estimated_time: 45,
};
assert.strictEqual(validateGeneratedQuestion(good), null, 'well-formed candidate is accepted');

const bad = (overrides) => validateGeneratedQuestion({ ...good, ...overrides });
assert.ok(bad({ question_text: '' }), 'empty question_text rejected');
assert.ok(bad({ option_c: '   ' }), 'blank option rejected');
assert.ok(bad({ explanation: '' }), 'empty explanation rejected');
assert.ok(bad({ correct_answer: 'E' }), 'out-of-range correct_answer rejected');
assert.ok(bad({ correct_answer: 'b' }), 'lowercase correct_answer rejected');
assert.ok(bad({ elo_question: 101 }), 'out-of-range elo_question rejected');
assert.ok(bad({ elo_question: 50.5 }), 'non-integer elo_question rejected');
assert.ok(bad({ estimated_time: 0 }), 'non-positive estimated_time rejected');
assert.ok(bad({ estimated_time: -5 }), 'negative estimated_time rejected');

console.log('generation.test.js: all assertions passed');
