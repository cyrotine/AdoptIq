const supabase = require('../../db/supabase');

// Adaptive-mastery baseline (spec 08). Per-topic student Elo lives in
// student_topic_mastery; a MISSING row means the default 50, so we never store
// rows that land on 50. A post-registration probe seeds this per area:
// marks band -> subject baseline, star rating -> per-area delta.

const DEFAULT_ELO = 50;

// Last-year marks band -> subject baseline Elo. Omitted marks => DEFAULT_ELO.
const MARK_BAND_ELO = { below40: 35, mid4060: 45, mid6080: 60, top80: 75 };

// Confidence stars (1-5) -> Elo delta on top of the subject baseline.
// Omitted / 3 stars is neutral.
const STAR_DELTA = { 1: -10, 2: -5, 3: 0, 4: 5, 5: 10 };

// Area -> chapter names. Names unique to one class (e.g. "Real Numbers" /
// "Number Systems") both live here; the topics query filters by the student's
// class, so only the right ones resolve. A chapter not listed stays at baseline.
const AREA_CHAPTERS = {
  Maths: {
    Algebra: ['Number Systems', 'Real Numbers', 'Polynomials', 'Linear Equations in Two Variables', 'Pair of Linear Equations in Two Variables', 'Quadratic Equations', 'Arithmetic Progressions'],
    Geometry: ["Introduction to Euclid's Geometry", 'Lines and Angles', 'Triangles', 'Quadrilaterals', 'Circles'],
    'Coordinate & Trigonometry': ['Coordinate Geometry', 'Introduction to Trigonometry', 'Some Applications of Trigonometry'],
    Mensuration: ["Heron's Formula", 'Surface Areas and Volumes', 'Areas Related to Circles'],
    'Statistics & Probability': ['Statistics', 'Probability'],
  },
  Science: {
    Chemistry: ['Matter in Our Surroundings', 'Is Matter Around Us Pure', 'Atoms and Molecules', 'Structure of the Atom', 'Chemical Reactions and Equations', 'Acids Bases and Salts', 'Metals and Non-metals', 'Carbon and Its Compounds', 'Periodic Classification of Elements'],
    'Mechanics & Electricity': ['Motion', 'Force and Laws of Motion', 'Gravitation', 'Work and Energy', 'Electricity', 'Magnetic Effects of Electric Current'],
    'Waves, Light & Sound': ['Sound', 'Light Reflection and Refraction', 'The Human Eye and the Colourful World'],
    Biology: ['The Fundamental Unit of Life', 'Tissues', 'Why Do We Fall Ill', 'Life Processes', 'Control and Coordination', 'How Do Organisms Reproduce', 'Heredity and Evolution'],
    'Environment & Energy': ['Natural Resources', 'Sources of Energy', 'Our Environment', 'Management of Natural Resources'],
  },
};

const SUBJECTS = Object.keys(AREA_CHAPTERS);

// chapter name -> area, per subject (reverse of AREA_CHAPTERS).
const CHAPTER_AREA = Object.fromEntries(
  SUBJECTS.map((subject) => [
    subject,
    Object.fromEntries(
      Object.entries(AREA_CHAPTERS[subject]).flatMap(([area, chapters]) =>
        chapters.map((chapter) => [chapter, area]),
      ),
    ),
  ]),
);

const clamp = (n) => Math.max(0, Math.min(100, n));

// Service results are { status, body } — controllers just forward them.
const ok = (status, body) => ({ status, body });
const fail = (status, message) => ({ status, body: { error: message } });

// Returns an error message string, or null if the payload is valid.
const validateBaseline = (payload) => {
  const mode = payload?.mode;
  if (!['skip', 'manual', 'probe'].includes(mode)) return 'mode must be skip, manual or probe';

  if (mode === 'manual') {
    const { elo } = payload;
    if (!Number.isInteger(elo) || elo < 0 || elo > 100) return 'elo must be an integer 0-100';
    return null;
  }

  if (mode === 'probe') {
    const { subjects } = payload;
    if (!subjects || typeof subjects !== 'object') return 'subjects object is required';
    for (const [subject, entry] of Object.entries(subjects)) {
      if (!SUBJECTS.includes(subject)) return `unknown subject: ${subject}`;
      if (entry?.marks !== undefined && !(entry.marks in MARK_BAND_ELO))
        return `unknown marks band: ${entry.marks}`;
      for (const [area, stars] of Object.entries(entry?.areas ?? {})) {
        if (!(area in AREA_CHAPTERS[subject])) return `unknown area for ${subject}: ${area}`;
        if (!(stars in STAR_DELTA)) return `stars must be 1-5 (${subject}/${area})`;
      }
    }
  }
  return null;
};

// Pure core (no DB): resolves the target Elo for every (subject, area).
// manual -> flat elo for all areas; probe -> baseline + star delta, clamped.
// Returns Map<"Subject::Area", elo>. Assumes payload already validated.
const computeTargets = (payload) => {
  const targets = new Map();
  for (const subject of SUBJECTS) {
    for (const area of Object.keys(AREA_CHAPTERS[subject])) {
      let elo;
      if (payload.mode === 'manual') {
        elo = payload.elo;
      } else {
        const entry = payload.subjects?.[subject] ?? {};
        const baseline = MARK_BAND_ELO[entry.marks] ?? DEFAULT_ELO;
        const stars = entry.areas?.[area] ?? 3;
        elo = clamp(baseline + STAR_DELTA[stars]);
      }
      targets.set(`${subject}::${area}`, elo);
    }
  }
  return targets;
};

// Seeds student_topic_mastery from the onboarding probe. Idempotent (upsert on
// the PK). Rows landing on the default 50 are skipped — a missing row is 50.
const seedBaseline = async (studentId, payload) => {
  const invalid = validateBaseline(payload);
  if (invalid) return fail(400, invalid);
  if (payload.mode === 'skip') return ok(200, { seeded: 0 });

  const { data: student, error: sErr } = await supabase
    .from('students')
    .select('class')
    .eq('student_id', studentId)
    .maybeSingle();
  if (sErr) throw new Error(`class lookup failed: ${sErr.message}`);
  if (!student) return fail(401, 'invalid token');

  const targets = computeTargets(payload);

  // All class-appropriate topics with their chapter + subject names.
  const { data: topics, error: tErr } = await supabase
    .from('topics')
    .select('topic_id, chapters!inner(chapter_name, class, subjects!inner(subject_name))')
    .eq('chapters.class', student.class);
  if (tErr) throw new Error(`topic lookup failed: ${tErr.message}`);

  const now = new Date().toISOString();
  const rows = [];
  for (const t of topics) {
    const subject = t.chapters.subjects.subject_name;
    const area = CHAPTER_AREA[subject]?.[t.chapters.chapter_name];
    if (!area) continue; // chapter not bucketed -> stays at baseline (no row)
    const elo = targets.get(`${subject}::${area}`);
    if (elo === undefined || elo === DEFAULT_ELO) continue; // don't store the default
    rows.push({ student_id: studentId, topic_id: t.topic_id, elo, attempts: 0, updated_on: now });
  }

  if (rows.length) {
    const { error: uErr } = await supabase
      .from('student_topic_mastery')
      .upsert(rows, { onConflict: 'student_id,topic_id' });
    if (uErr) throw new Error(`seed upsert failed: ${uErr.message}`);
  }
  return ok(200, { seeded: rows.length });
};

// Current mastery Elo for a (student, topic). Missing row => default 50.
// Used by the Phase-4 Elo engine.
const getTopicElo = async (studentId, topicId) => {
  const { data, error } = await supabase
    .from('student_topic_mastery')
    .select('elo')
    .eq('student_id', studentId)
    .eq('topic_id', topicId)
    .maybeSingle();
  if (error) throw new Error(`elo lookup failed: ${error.message}`);
  return data ? data.elo : DEFAULT_ELO;
};

// ===========================================================================
// Adaptive Elo engine (spec 09). After each quiz, per-topic Elo moves against
// the ability the student STARTED the quiz with (batch, never sequentially) —
// modulated by passive behavioural signals: engagement, slip, fatigue,
// indecision, staleness. All constants are conservative, empirical KNOBS.
// ===========================================================================

const D = 32;             // logistic spread (0-100 scale); the main tuning knob.
const K_MAX = 8;          // learning rate for a brand-new topic (attempts = 0).
const K_MIN = 3;          // floor for a well-established topic.
const TAU = 10;           // attempts-scale of the K decay.
const GUESS = 0.25;       // 4-option MCQ guess floor on expected score.

const RAPID_FRACTION = 0.15; // time < 0.15 * est  => rapid guess.
const RAPID_WEIGHT = 0.15;
const IDLE_MULT = 4;         // time > 4 * est     => idling / distracted.
const IDLE_WEIGHT = 0.4;
const SPEED_BETA = 0.15;     // engaged speed nudge, bounded [0.85, 1.15].
const SLIP_GAP = 15;         // strong student (S - Q > 15) missing an easy item.
const SLIP_WEIGHT = 0.5;     // ...counts as half a down-move (likely a slip).
const FATIGUE_START = 15;    // errors after position 15 discounted...
const FATIGUE_SLOPE = 0.005; // ...down to a 0.85 floor.
const CHURN_SLOPE = 0.1;     // each answer change (capped at 3) dampens...
const CHURN_CAP = 3;         // ...to a 0.7 floor.
const FORGET_START_DAYS = 30;// staleness beyond a month pulls S toward 50...
const FORGET_SPAN_DAYS = 335;// ...reaching a max 15% pull after ~1 year.
const FORGET_MAX = 0.15;
const HEADROOM_SPAN = 50;    // room-to-edge scale: step shrinks to 0 as S nears 0/100.

const clampRange = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const expectedScore = (s, q) => GUESS + (1 - GUESS) / (1 + Math.pow(10, (q - s) / D));
const dynamicK = (attempts) => K_MIN + (K_MAX - K_MIN) * Math.exp(-attempts / TAU);

// A response is "engaged" only between the rapid-guess and idling time gates.
// Missing estimated_time (older questions) is treated as engaged (neutral).
const isEngaged = (time, est) =>
  est == null || time == null || (time >= RAPID_FRACTION * est && time <= IDLE_MULT * est);

const effortWeight = (time, est) => {
  if (est == null || time == null) return 1;
  if (time < RAPID_FRACTION * est) return RAPID_WEIGHT;
  if (time > IDLE_MULT * est) return IDLE_WEIGHT;
  return 1;
};

// Engaged only: faster-than-expected => >1, slower => <1. Neutral otherwise.
const speedWeight = (time, est) => {
  if (est == null || time == null || !isEngaged(time, est)) return 1;
  return clampRange(1 + SPEED_BETA * (1 - time / est), 0.85, 1.15);
};

// Engaged wrong answer from a much stronger student on an easy item => slip.
const slipWeight = (score, s, q, time, est) =>
  score === 0 && isEngaged(time, est) && s - q > SLIP_GAP ? SLIP_WEIGHT : 1;

// Wrong answers late in the quiz are weaker evidence of low skill.
const fatigueWeight = (score, position) =>
  score === 0 && position != null
    ? clampRange(1 - FATIGUE_SLOPE * Math.max(0, position - FATIGUE_START), 0.85, 1)
    : 1;

// More answer switching => more indecision => less signal.
const churnWeight = (answerChanges) =>
  clampRange(1 - CHURN_SLOPE * Math.min(answerChanges ?? 0, CHURN_CAP), 0.7, 1);

// Stale topic: nudge the starting Elo toward the neutral 50 before updating.
const forgetElo = (s, updatedOn, now = Date.now()) => {
  if (!updatedOn) return s;
  const staleDays = (now - new Date(updatedOn).getTime()) / 86400000;
  const factor = clampRange((staleDays - FORGET_START_DAYS) / FORGET_SPAN_DAYS, 0, FORGET_MAX);
  return s + (50 - s) * factor;
};

// Ceiling/floor effect: the step shrinks as S approaches whichever edge it's
// moving toward (100 for an upward move, 0 for a downward one), so the same
// evidence buys less progress near the extremes than it does mid-scale.
const headroomWeight = (raw, s) =>
  clampRange(raw > 0 ? (100 - s) / HEADROOM_SPAN : s / HEADROOM_SPAN, 0, 1);

// One response's contribution to ΔS, against the batch-frozen ability `s`.
// r = { Q, score (0|1), time_taken, estimated_time, position, answer_changes }.
const responseDelta = (r, s, attempts) => {
  const weight =
    effortWeight(r.time_taken, r.estimated_time) *
    speedWeight(r.time_taken, r.estimated_time) *
    slipWeight(r.score, s, r.Q, r.time_taken, r.estimated_time) *
    fatigueWeight(r.score, r.position) *
    churnWeight(r.answer_changes);
  const raw = r.score - expectedScore(s, r.Q);
  return dynamicK(attempts) * weight * headroomWeight(raw, s) * raw;
};

// Batch read of current mastery for a set of topics. Missing => the defaults.
const getTopicMastery = async (studentId, topicIds) => {
  const map = new Map(topicIds.map((id) => [id, { elo: DEFAULT_ELO, attempts: 0, updated_on: null }]));
  if (!topicIds.length) return map;
  const { data, error } = await supabase
    .from('student_topic_mastery')
    .select('topic_id, elo, attempts, updated_on')
    .eq('student_id', studentId)
    .in('topic_id', topicIds);
  if (error) throw new Error(`mastery lookup failed: ${error.message}`);
  for (const row of data) map.set(row.topic_id, { elo: row.elo, attempts: row.attempts, updated_on: row.updated_on });
  return map;
};

// Per-quiz Elo update. `graded` is one entry per response (see responseDelta).
// Rows are upserted even when Elo lands ~50: unlike a seeded baseline, an
// attempted topic carries non-derivable `attempts` state that drives K.
const updateFromQuiz = async (studentId, graded) => {
  if (!graded || !graded.length) return { updated: 0 };

  const byTopic = new Map();
  for (const r of graded) {
    if (!byTopic.has(r.topic_id)) byTopic.set(r.topic_id, []);
    byTopic.get(r.topic_id).push(r);
  }

  const mastery = await getTopicMastery(studentId, [...byTopic.keys()]);
  const now = new Date();
  const rows = [];
  for (const [topicId, responses] of byTopic) {
    const { elo, attempts, updated_on } = mastery.get(topicId);
    const s = forgetElo(elo, updated_on, now.getTime());
    let delta = 0;
    for (const r of responses) delta += responseDelta(r, s, attempts);
    rows.push({
      student_id: studentId,
      topic_id: topicId,
      elo: Math.round(clamp(s + delta)),
      attempts: attempts + responses.length,
      updated_on: now.toISOString(),
    });
  }

  const { error } = await supabase
    .from('student_topic_mastery')
    .upsert(rows, { onConflict: 'student_id,topic_id' });
  if (error) throw new Error(`mastery update failed: ${error.message}`);
  return { updated: rows.length };
};

module.exports = {
  seedBaseline,
  getTopicElo,
  getTopicMastery,
  updateFromQuiz,
  // exported for the self-check test
  MARK_BAND_ELO,
  STAR_DELTA,
  AREA_CHAPTERS,
  DEFAULT_ELO,
  validateBaseline,
  computeTargets,
  clamp,
  expectedScore,
  dynamicK,
  responseDelta,
  forgetElo,
  effortWeight,
  slipWeight,
  fatigueWeight,
  churnWeight,
  speedWeight,
  headroomWeight,
};
