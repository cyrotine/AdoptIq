// Minimal check for takeRoundRobin's even chapter spread (Spec 05).
// Run: node backend/services/quiz.roundrobin.test.js
const assert = require('assert');
const { takeRoundRobin } = require('./quiz.service');

const makePool = (perChapter) =>
  Object.entries(perChapter).flatMap(([chapter_id, n]) =>
    Array.from({ length: n }, (_, i) => ({ question_id: `${chapter_id}-${i}`, chapter_id: Number(chapter_id) })),
  );

const countByChapter = (arr) => {
  const c = {};
  for (const q of arr) c[q.chapter_id] = (c[q.chapter_id] || 0) + 1;
  return c;
};

// Two chapters with plenty of questions → near-even split (30 → 15/15).
{
  const pool = makePool({ 1: 100, 2: 100 });
  const taken = takeRoundRobin(pool, 30);
  const c = countByChapter(taken);
  assert.strictEqual(taken.length, 30);
  assert.ok(Math.abs(c[1] - c[2]) <= 1, `expected ~15/15, got ${JSON.stringify(c)}`);
  assert.strictEqual(pool.length, 170, 'taken questions removed from pool');
}

// Thin chapter → its shortfall redistributed to the other.
{
  const pool = makePool({ 1: 3, 2: 100 });
  const taken = takeRoundRobin(pool, 30);
  const c = countByChapter(taken);
  assert.strictEqual(taken.length, 30);
  assert.strictEqual(c[1], 3, 'thin chapter gives all it has');
  assert.strictEqual(c[2], 27, 'remainder taken from surplus chapter');
}

// Pool smaller than n → take everything, no crash.
{
  const pool = makePool({ 1: 4, 2: 4 });
  const taken = takeRoundRobin(pool, 30);
  assert.strictEqual(taken.length, 8);
  assert.strictEqual(pool.length, 0);
}

console.log('takeRoundRobin: all checks passed');
