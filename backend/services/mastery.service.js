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

module.exports = {
  seedBaseline,
  getTopicElo,
  // exported for the self-check test
  MARK_BAND_ELO,
  STAR_DELTA,
  AREA_CHAPTERS,
  DEFAULT_ELO,
  validateBaseline,
  computeTargets,
};
