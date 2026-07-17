// Self-check for the adaptive Elo engine (Spec 09). DB-free: only the pure
// scoring core is exercised. Run: node backend/services/mastery.elo.test.js
const assert = require('assert');
const {
  clamp,
  expectedScore,
  dynamicK,
  responseDelta,
  forgetElo,
  effortWeight,
  speedWeight,
  slipWeight,
  fatigueWeight,
  churnWeight,
} = require('./mastery.service');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// expected score: guess floor 0.25, ceiling 1, 0.625 at equal ratings.
assert.ok(near(expectedScore(50, 50), 0.625), 'equal ratings => 0.25 + 0.75/2');
assert.ok(expectedScore(0, 100) >= 0.25 && expectedScore(0, 100) < 0.3, 'hard item floors near 0.25');
assert.ok(expectedScore(100, 0) > 0.99, 'trivial item approaches 1');
for (const [s, q] of [[0, 0], [50, 20], [30, 90], [100, 100]])
  assert.ok(expectedScore(s, q) > 0.25 && expectedScore(s, q) < 1, `expected in (0.25,1) for ${s},${q}`);

// direction: an engaged correct answer raises, a wrong one lowers.
const engaged = { Q: 50, time_taken: 30, estimated_time: 30 };
assert.ok(responseDelta({ ...engaged, score: 1 }, 50, 0) > 0, 'correct raises');
assert.ok(responseDelta({ ...engaged, score: 0 }, 50, 0) < 0, 'wrong lowers');

// effort gate: rapid guess barely counts (0.15), idling 0.4, engaged 1, and a
// rapid-guess update is far smaller than an engaged one (but not zero).
assert.strictEqual(effortWeight(2, 30), 0.15, 'time < 0.15*est => rapid guess');
assert.strictEqual(effortWeight(200, 30), 0.4, 'time > 4*est => idling');
assert.strictEqual(effortWeight(15, 30), 1, 'normal pace => engaged');
assert.strictEqual(effortWeight(15, null), 1, 'missing estimated_time => neutral');
const rapid = responseDelta({ Q: 50, score: 1, time_taken: 2, estimated_time: 30 }, 50, 0);
const engagedDelta = responseDelta({ ...engaged, score: 1 }, 50, 0);
assert.ok(rapid > 0 && rapid < engagedDelta * 0.3, 'rapid guess still moves Elo, but barely');

// slip guard: a strong student missing an easy item at an engaged pace halves
// the down-move; it does not apply to rapid guesses or weak students.
assert.strictEqual(slipWeight(0, 80, 50, 30, 30), 0.5, 'engaged easy-miss by strong student => slip');
assert.strictEqual(slipWeight(0, 80, 50, 1, 30), 1, 'rapid guess is not a slip');
assert.strictEqual(slipWeight(0, 55, 50, 30, 30), 1, 'small gap => not a slip');
assert.strictEqual(slipWeight(1, 80, 50, 30, 30), 1, 'correct answer => no slip guard');

// fatigue only discounts late wrong answers; churn dampens with switches.
assert.strictEqual(fatigueWeight(1, 30), 1, 'correct answers never fatigue-discounted');
assert.ok(fatigueWeight(0, 30) < 1 && fatigueWeight(0, 30) >= 0.85, 'late wrong answer discounted, floored');
assert.strictEqual(fatigueWeight(0, null), 1, 'missing position => neutral');
assert.strictEqual(churnWeight(0), 1, 'no switches => neutral');
assert.ok(near(churnWeight(2), 0.8), '2 switches => 1 - 0.2');
assert.strictEqual(churnWeight(10), 0.7, 'churn floored at 0.7 (cap 3)');
assert.strictEqual(churnWeight(undefined), 1, 'missing answer_changes => neutral');

// speed: engaged faster-than-expected > 1, slower < 1, bounded.
assert.ok(speedWeight(15, 30) > 1, 'faster than expected => >1');
assert.ok(speedWeight(45, 30) < 1, 'slower than expected => <1');
assert.strictEqual(speedWeight(2, 30), 1, 'rapid guess => neutral speed');
assert.strictEqual(speedWeight(30, null), 1, 'missing estimated_time => neutral speed');

// dynamic K shrinks monotonically as attempts accumulate.
assert.ok(near(dynamicK(0), 8), 'fresh topic K = K_max');
assert.ok(dynamicK(0) > dynamicK(10) && dynamicK(10) > dynamicK(100), 'K decays with attempts');
assert.ok(dynamicK(1000) >= 3 && near(dynamicK(1000), 3, 1e-9), 'K settles at the floor, never below');

// forgetting: fresh topic unchanged; a stale one nudged toward 50, bounded.
const day = 86400000;
const now = Date.now();
assert.strictEqual(forgetElo(80, new Date(now).toISOString(), now), 80, 'fresh topic unchanged');
assert.strictEqual(forgetElo(80, null, now), 80, 'no timestamp => unchanged');
const stale = forgetElo(80, new Date(now - 400 * day).toISOString(), now);
assert.ok(stale < 80 && stale >= 80 + (50 - 80) * 0.15, 'very stale topic pulled toward 50, capped at 15%');

// clamp keeps Elo in range; missing signals never throw.
assert.strictEqual(clamp(150), 100);
assert.strictEqual(clamp(-5), 0);
const bare = responseDelta({ Q: 50, score: 1, time_taken: 30 }, 50, 0); // no est/position/changes
assert.ok(Number.isFinite(bare) && bare > 0, 'missing signals => neutral weights, still moves');

console.log('mastery.elo.test.js: all assertions passed');
