// Minimal check for the probe -> Elo mapping (Spec 08). DB-free: only the pure
// computeTargets / validateBaseline core is exercised.
// Run: node backend/services/mastery.baseline.test.js
const assert = require('assert');
const { computeTargets, validateBaseline, MARK_BAND_ELO, STAR_DELTA } = require('./mastery.service');

const K = (s, a) => `${s}::${a}`;

// probe: baseline from marks, per-area star delta, clamped.
{
  const payload = {
    mode: 'probe',
    subjects: {
      Maths: { marks: 'top80', areas: { Algebra: 5, Geometry: 1 } }, // 75 +10 / -10
      Science: { marks: 'below40', areas: { Chemistry: 1 } },        // 35 -10 -> clamp
    },
  };
  assert.strictEqual(validateBaseline(payload), null);
  const t = computeTargets(payload);
  assert.strictEqual(t.get(K('Maths', 'Algebra')), 85, 'top80 + 5 stars');
  assert.strictEqual(t.get(K('Maths', 'Geometry')), 65, 'top80 + 1 star');
  assert.strictEqual(t.get(K('Maths', 'Mensuration')), 75, 'unrated area = baseline (3 stars)');
  assert.strictEqual(t.get(K('Science', 'Chemistry')), 25, 'below40 - 10');
  // Science areas with no marks entry default to baseline 50 via omitted marks?
  // marks IS given (below40) so unrated Science area = 35.
  assert.strictEqual(t.get(K('Science', 'Biology')), 35, 'below40 baseline, neutral');
}

// probe with no marks -> baseline is the default 50, so neutral areas land on 50.
{
  const t = computeTargets({ mode: 'probe', subjects: { Maths: { areas: { Algebra: 5 } } } });
  assert.strictEqual(t.get(K('Maths', 'Algebra')), 60, '50 + 10');
  assert.strictEqual(t.get(K('Maths', 'Geometry')), 50, 'no marks, neutral -> default');
}

// manual: flat elo for every area, both subjects.
{
  const t = computeTargets({ mode: 'manual', elo: 70 });
  for (const v of t.values()) assert.strictEqual(v, 70, 'manual is flat');
}

// clamp at both ends.
{
  const low = computeTargets({ mode: 'probe', subjects: { Maths: { marks: 'below40', areas: { Algebra: 1 } } } });
  assert.ok(low.get(K('Maths', 'Algebra')) >= 0, 'no negative Elo'); // 35-10=25 ok, but sanity
  const hi = computeTargets({ mode: 'manual', elo: 100 });
  for (const v of hi.values()) assert.ok(v <= 100, 'no Elo above 100');
}

// validation rejects bad input.
assert.match(validateBaseline({ mode: 'nope' }), /mode must be/);
assert.match(validateBaseline({ mode: 'manual', elo: 200 }), /elo must be/);
assert.match(validateBaseline({ mode: 'manual', elo: 5.5 }), /elo must be/);
assert.match(validateBaseline({ mode: 'probe', subjects: { History: {} } }), /unknown subject/);
assert.match(validateBaseline({ mode: 'probe', subjects: { Maths: { marks: 'perfect' } } }), /unknown marks/);
assert.match(validateBaseline({ mode: 'probe', subjects: { Maths: { areas: { Poetry: 3 } } } }), /unknown area/);
assert.match(validateBaseline({ mode: 'probe', subjects: { Maths: { areas: { Algebra: 9 } } } }), /stars must be/);
assert.strictEqual(validateBaseline({ mode: 'skip' }), null);

// sanity: the maps line up with the spec.
assert.deepStrictEqual(MARK_BAND_ELO, { below40: 35, mid4060: 45, mid6080: 60, top80: 75 });
assert.strictEqual(STAR_DELTA[3], 0);

console.log('mastery.baseline.test.js: all assertions passed');
