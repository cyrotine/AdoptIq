const supabase = require('../../db/supabase');
const { validateSubjectId } = require('../utils/validate');

const listSubjects = async () => {
  const { data: subjects, error } = await supabase
    .from('subjects')
    .select('subject_id, subject_name')
    .order('subject_id');

  if (error) throw new Error(`subjects lookup failed: ${error.message}`);

  return { status: 200, body: { subjects } };
};

// Chapters for a subject within a class. Shared by listChapters (this file) and
// the chapter-ownership guard in quiz.service.generate.
const getChapters = async (subjectId, cls) => {
  const { data, error } = await supabase
    .from('chapters')
    .select('chapter_id, chapter_name')
    .eq('subject_id', subjectId)
    .eq('class', cls)
    .order('chapter_id');
  if (error) throw new Error(`chapters lookup failed: ${error.message}`);
  return data;
};

const listChapters = async (studentId, subjectId) => {
  const invalid = validateSubjectId(subjectId);
  if (invalid) return { status: 400, body: { error: invalid } };

  const { data: student, error } = await supabase
    .from('students')
    .select('class')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw new Error(`student lookup failed: ${error.message}`);
  if (!student) return { status: 401, body: { error: 'invalid token' } };

  const chapters = await getChapters(subjectId, student.class);
  return { status: 200, body: { chapters } };
};

module.exports = { listSubjects, listChapters, getChapters };
