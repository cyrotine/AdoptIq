const supabase = require('../../db/supabase');

// Spec 11. Topics ranked by how many times they've been asked, across all
// students. Derived at read time via the topic_ask_counts() SQL function —
// never a stored counter (CLAUDE.md: don't store derivable data).
const topicAskCounts = async () => {
  const { data: topics, error } = await supabase.rpc('topic_ask_counts');
  if (error) throw new Error(`topic ask counts failed: ${error.message}`);

  return { status: 200, body: { topics } };
};

module.exports = { topicAskCounts };
