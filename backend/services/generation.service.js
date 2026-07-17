// Spec 12 — stateless generation core. The ai/* modules stay pure; this service
// is where they meet the database. Under the retrieval-driven design (spec 13),
// existing questions are used as retrieval SEEDS, not fed to the model; only the
// chunks they retrieve reach the prompt. This service holds the seed selection
// and the chunks->questions generation; the retrieval step (embed seed -> vector
// search session_chunks) lives in session.service, which has the embedded store.
const supabase = require('../../db/supabase');
const { chunkText } = require('../../ai/chunk');
const { generateQuestions } = require('../../ai/groq');
const { buildPrompt } = require('../../ai/prompts/questionGenerator');
const { validateGeneratedQuestion } = require('../utils/validate');

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Topic + chapter names for the prompt header. Throws if the topic is unknown.
const getTopicContext = async (topicId) => {
  const { data: topic, error } = await supabase
    .from('topics')
    .select('topic_name, chapters!inner(chapter_name)')
    .eq('topic_id', topicId)
    .maybeSingle();
  if (error) throw new Error(`topic lookup failed: ${error.message}`);
  if (!topic) throw new Error(`topic ${topicId} not found`);

  // PostgREST returns an object for a to-one embed, but guard the array shape too.
  const chapter = Array.isArray(topic.chapters) ? topic.chapters[0] : topic.chapters;
  return { topicName: topic.topic_name, chapterName: chapter ? chapter.chapter_name : null };
};

// Seed questions to drive chunk retrieval (spec 13). First choice: this topic's
// questions whose frozen Elo sits within ±threshold of the target. If that band
// is empty, fall back to any k questions on the topic (better a broad seed than
// none). Each seed carries question_text, which the caller embeds as a query.
// Empty result means the topic has no questions at all — caller feeds all chunks.
const getSeedQuestions = async (topicId, targetElo, { threshold = 10, k = 5 } = {}) => {
  const lo = clamp(targetElo - threshold, 0, 100);
  const hi = clamp(targetElo + threshold, 0, 100);

  const { data: inBand, error } = await supabase
    .from('questions')
    .select('question_id, question_text, elo_question')
    .eq('topic_id', topicId)
    .gte('elo_question', lo)
    .lte('elo_question', hi);
  if (error) throw new Error(`seed questions lookup failed: ${error.message}`);
  if (inBand && inBand.length > 0) return inBand;

  // Nothing in the Elo band — fall back to k questions on the topic (any Elo).
  const { data: fallback, error: fbErr } = await supabase
    .from('questions')
    .select('question_id, question_text, elo_question')
    .eq('topic_id', topicId)
    .limit(k);
  if (fbErr) throw new Error(`fallback seed lookup failed: ${fbErr.message}`);
  return fallback || [];
};

// Chunks -> candidate questions. Reference/seed questions are NOT passed here —
// they were already used upstream to retrieve these chunks. Returns a summary;
// writes nothing anywhere.
const generateFromChunks = async ({ topicId, targetElo, count, chunks }) => {
  const { topicName, chapterName } = await getTopicContext(topicId);

  const prompt = buildPrompt({ topicName, chapterName, chunks, targetElo, count });
  const generated = await generateQuestions(prompt);

  const candidates = [];
  const rejected = [];
  for (const item of generated) {
    const reason = validateGeneratedQuestion(item);
    if (reason) rejected.push({ reason, question: item });
    else candidates.push(item);
  }

  return {
    requested: count,
    generated: generated.length,
    valid: candidates.length,
    invalid: rejected.length,
    candidates,
    rejected,
  };
};

// Spec 12 CLI dev tool: no embedded store, so no retrieval — it just feeds ALL
// chunks of the raw text. The production path (session.service) retrieves the
// top chunks per seed question instead. Kept for quick local testing.
const generateCandidates = ({ topicId, targetElo, count, sourceText }) =>
  generateFromChunks({ topicId, targetElo, count, chunks: chunkText(sourceText) });

module.exports = { getTopicContext, getSeedQuestions, generateFromChunks, generateCandidates };
