// Field validators. Each returns an error message string, or null if valid.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

const validateRegistration = ({ name, username, email, password, class: cls }) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 100)
    return 'name is required (max 100 characters)';
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return 'username must be 3-30 characters (letters, numbers, underscore)';
  if (typeof email !== 'string' || email.length > 100 || !EMAIL_RE.test(email))
    return 'a valid email is required (max 100 characters)';
  if (typeof password !== 'string' || password.length < 8)
    return 'password must be at least 8 characters';
  if (!Number.isInteger(cls) || ![9, 10].includes(cls))
    return 'class must be 9 or 10';
  return null;
};

const validateLogin = ({ identifier, password }) => {
  if (typeof identifier !== 'string' || !identifier.trim())
    return 'identifier (username or email) is required';
  if (typeof password !== 'string' || !password)
    return 'password is required';
  return null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANSWERS = ['A', 'B', 'C', 'D'];

const validateSubjectId = (subject_id) =>
  !Number.isInteger(subject_id) || subject_id < 1 ? 'subject_id must be a positive integer' : null;

const validateGenerate = ({ subject_id, chapter_ids, easy, medium, hard }) => {
  const badSubject = validateSubjectId(subject_id);
  if (badSubject) return badSubject;

  if (!Array.isArray(chapter_ids) || chapter_ids.length < 1 || chapter_ids.length > 50)
    return 'chapter_ids must be an array of 1-50 items';
  const seen = new Set();
  for (const id of chapter_ids) {
    if (!Number.isInteger(id) || id < 1) return 'each chapter_id must be a positive integer';
    if (seen.has(id)) return 'duplicate chapter_id';
    seen.add(id);
  }

  for (const [label, count] of [['easy', easy], ['medium', medium], ['hard', hard]]) {
    if (!Number.isInteger(count) || count < 0 || count > 30)
      return `${label} must be an integer between 0 and 30`;
  }
  if (easy + medium + hard !== 30) return 'easy + medium + hard must equal 30';

  return null;
};

const validateQuizId = (quizId) =>
  typeof quizId !== 'string' || !UUID_RE.test(quizId) ? 'quizId must be a valid uuid' : null;

const validateSubmit = ({ subject_id, total_time_taken, responses }) => {
  const badSubject = validateSubjectId(subject_id);
  if (badSubject) return badSubject;
  if (!Number.isInteger(total_time_taken) || total_time_taken < 0)
    return 'total_time_taken must be a non-negative integer (seconds)';
  if (!Array.isArray(responses) || responses.length < 1 || responses.length > 50)
    return 'responses must be an array of 1-50 items';

  const seen = new Set();
  for (const r of responses) {
    if (typeof r !== 'object' || r === null) return 'each response must be an object';
    if (typeof r.question_id !== 'string' || !UUID_RE.test(r.question_id))
      return 'each response needs a valid question_id (uuid)';
    if (seen.has(r.question_id)) return 'duplicate question_id in responses';
    seen.add(r.question_id);
    if (r.student_answer !== null && !ANSWERS.includes(r.student_answer))
      return 'student_answer must be A, B, C, D, or null';
    if (!Number.isInteger(r.time_taken) || r.time_taken < 0)
      return 'each response needs a non-negative integer time_taken (seconds)';
    // Optional spec-09 signals; missing is fine (engine falls back to neutral).
    if (r.answer_changes !== undefined && (!Number.isInteger(r.answer_changes) || r.answer_changes < 0))
      return 'answer_changes must be a non-negative integer';
    if (r.position !== undefined && (!Number.isInteger(r.position) || r.position < 1))
      return 'position must be a positive integer';
  }
  return null;
};

// Spec 12 — one AI-generated question candidate, checked at the same trust
// boundary as any client body (JSON mode guarantees valid JSON, not a valid shape).
const validateGeneratedQuestion = (q) => {
  if (typeof q !== 'object' || q === null) return 'question must be an object';
  for (const f of ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation']) {
    if (typeof q[f] !== 'string' || !q[f].trim()) return `${f} must be a non-empty string`;
  }
  if (!ANSWERS.includes(q.correct_answer)) return 'correct_answer must be A, B, C, or D';
  if (!Number.isInteger(q.elo_question) || q.elo_question < 0 || q.elo_question > 100)
    return 'elo_question must be an integer between 0 and 100';
  if (!Number.isInteger(q.estimated_time) || q.estimated_time < 1)
    return 'estimated_time must be a positive integer (seconds)';
  return null;
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateSubjectId,
  validateGenerate,
  validateSubmit,
  validateQuizId,
  validateGeneratedQuestion,
};
