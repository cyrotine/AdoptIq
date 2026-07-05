const supabase = require('../../db/supabase');

const listSubjects = async () => {
  const { data: subjects, error } = await supabase
    .from('subjects')
    .select('subject_id, subject_name')
    .order('subject_id');

  if (error) throw new Error(`subjects lookup failed: ${error.message}`);

  return { status: 200, body: { subjects } };
};

module.exports = { listSubjects };
