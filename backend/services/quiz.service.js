const supabase = require('../../db/supabase');
const { validateGenerate, validateSubmit, validateQuizId } = require('../utils/validate');

const ok = (status, body) => ({ status, body });
const fail = (status, message) => ({ status, body: { error: message } });

// MVP composition: fixed mix, shortfall filled from whatever has surplus.
// Phase 4 (RL/mastery) replaces only this selection step.
const QUIZ_SIZE = 30;
const MIX = [['Easy', 12], ['Medium', 12], ['Hard', 6]];
const FILL_ORDER = ['Medium', 'Easy', 'Hard'];

// In-place Fisher–Yates.
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const getSubject = async (subjectId) => {
  const { data, error } = await supabase
    .from('subjects')
    .select('subject_id, subject_name')
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (error) throw new Error(`subject lookup failed: ${error.message}`);
  return data;
};

const getStudent = async (studentId, columns) => {
  const { data, error } = await supabase
    .from('students')
    .select(columns)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw new Error(`student lookup failed: ${error.message}`);
  return data;
};

const generate = async (studentId, input) => {
  const invalid = validateGenerate(input);
  if (invalid) return fail(400, invalid);

  const subject = await getSubject(input.subject_id);
  if (!subject) return fail(400, 'unknown subject');

  const student = await getStudent(studentId, 'class');
  if (!student) return fail(401, 'invalid token');

  // Candidates for subject + class. correct_answer/explanation never selected.
  const { data: candidates, error } = await supabase
    .from('questions')
    .select(
      'question_id, question_text, option_a, option_b, option_c, option_d, difficulty_label, estimated_time, topics!inner(chapters!inner())',
    )
    .eq('topics.chapters.subject_id', subject.subject_id)
    .eq('topics.chapters.class', student.class);
  if (error) throw new Error(`question lookup failed: ${error.message}`);

  if (!candidates.length) {
    return fail(400, 'no questions available for this subject yet');
  }

  const buckets = { Easy: [], Medium: [], Hard: [] };
  for (const { topics, ...question } of candidates) {
    buckets[question.difficulty_label].push(question);
  }
  Object.values(buckets).forEach(shuffle);

  const picked = [];
  for (const [label, want] of MIX) picked.push(...buckets[label].splice(0, want));
  for (const label of FILL_ORDER) {
    const shortfall = QUIZ_SIZE - picked.length;
    if (!shortfall) break;
    picked.push(...buckets[label].splice(0, shortfall));
  }
  shuffle(picked);

  const composition = { easy: 0, medium: 0, hard: 0 };
  for (const q of picked) composition[q.difficulty_label.toLowerCase()]++;

  // Stateless: nothing is written until submit; abandoned quizzes leave no rows.
  return ok(200, { subject: subject.subject_name, composition, questions: picked });
};

const submit = async (studentId, input) => {
  const invalid = validateSubmit(input);
  if (invalid) return fail(400, invalid);

  const subject = await getSubject(input.subject_id);
  if (!subject) return fail(400, 'unknown subject');

  const ids = input.responses.map((r) => r.question_id);
  const { data: questions, error } = await supabase
    .from('questions')
    .select(
      'question_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty_label',
    )
    .in('question_id', ids);
  if (error) throw new Error(`question fetch failed: ${error.message}`);

  const byId = new Map(questions.map((q) => [q.question_id, q]));
  if (byId.size !== ids.length) return fail(404, 'unknown question_id in submission');

  // Grade server-side; unanswered (null) counts wrong.
  const composition = { easy: 0, medium: 0, hard: 0 };
  let score = 0;
  const results = input.responses.map((response) => {
    const { difficulty_label, ...question } = byId.get(response.question_id);
    composition[difficulty_label.toLowerCase()]++;
    const is_correct = response.student_answer === question.correct_answer;
    if (is_correct) score++;
    return { ...question, student_answer: response.student_answer, is_correct };
  });

  // ponytail: three separate writes, not one transaction (spec Risk 2) —
  // upgrade path is a single Postgres RPC if counter skew ever matters.
  const { data: quiz, error: historyError } = await supabase
    .from('quiz_history')
    .insert({
      student_id: studentId,
      subject: subject.subject_name,
      easy_questions: composition.easy,
      medium_questions: composition.medium,
      hard_questions: composition.hard,
      correct_answers: score,
      total_time_taken: input.total_time_taken,
    })
    .select('quiz_id')
    .single();
  if (historyError) throw new Error(`quiz_history insert failed: ${historyError.message}`);

  const { error: responsesError } = await supabase.from('quiz_responses').insert(
    input.responses.map((r) => ({
      quiz_id: quiz.quiz_id,
      question_id: r.question_id,
      student_answer: r.student_answer,
      time_taken: r.time_taken,
    })),
  );
  if (responsesError) throw new Error(`quiz_responses insert failed: ${responsesError.message}`);

  const student = await getStudent(studentId, 'total_quizzes, correct_answers');
  const { error: counterError } = await supabase
    .from('students')
    .update({
      total_quizzes: student.total_quizzes + 1,
      correct_answers: student.correct_answers + score,
    })
    .eq('student_id', studentId);
  if (counterError) throw new Error(`student counter update failed: ${counterError.message}`);

  return ok(201, {
    quiz_id: quiz.quiz_id,
    score,
    total: input.responses.length,
    composition,
    total_time_taken: input.total_time_taken,
    results,
  });
};

const listHistory = async (studentId) => {
  const { data, error } = await supabase
    .from('quiz_history')
    .select(
      'quiz_id, subject, completed_on, easy_questions, medium_questions, hard_questions, correct_answers, total_time_taken',
    )
    .eq('student_id', studentId)
    .order('completed_on', { ascending: false });
  if (error) throw new Error(`quiz_history lookup failed: ${error.message}`);

  const history = data.map((row) => {
    const total_questions = row.easy_questions + row.medium_questions + row.hard_questions;
    const accuracy = total_questions ? row.correct_answers / total_questions : 0;
    return { ...row, total_questions, accuracy };
  });

  return ok(200, { history });
};

const getHistoryDetail = async (studentId, quizId) => {
  const invalid = validateQuizId(quizId);
  if (invalid) return fail(400, invalid);

  const { data: quiz, error: quizError } = await supabase
    .from('quiz_history')
    .select(
      'quiz_id, student_id, easy_questions, medium_questions, hard_questions, correct_answers, total_time_taken',
    )
    .eq('quiz_id', quizId)
    .maybeSingle();
  if (quizError) throw new Error(`quiz_history lookup failed: ${quizError.message}`);
  if (!quiz || quiz.student_id !== studentId) return fail(404, 'quiz not found');

  const { data: responses, error: responsesError } = await supabase
    .from('quiz_responses')
    .select('question_id, student_answer')
    .eq('quiz_id', quizId);
  if (responsesError) throw new Error(`quiz_responses lookup failed: ${responsesError.message}`);

  const ids = responses.map((r) => r.question_id);
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('question_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation')
    .in('question_id', ids);
  if (questionsError) throw new Error(`question lookup failed: ${questionsError.message}`);

  const byId = new Map(questions.map((q) => [q.question_id, q]));
  const results = responses.map(({ question_id, student_answer }) => {
    const question = byId.get(question_id);
    return { ...question, student_answer, is_correct: student_answer === question.correct_answer };
  });

  return ok(200, {
    quiz_id: quiz.quiz_id,
    score: quiz.correct_answers,
    total: quiz.easy_questions + quiz.medium_questions + quiz.hard_questions,
    composition: { easy: quiz.easy_questions, medium: quiz.medium_questions, hard: quiz.hard_questions },
    total_time_taken: quiz.total_time_taken,
    results,
  });
};

module.exports = { generate, submit, listHistory, getHistoryDetail };
