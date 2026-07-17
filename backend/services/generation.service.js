// Spec 12 — stateless generation core. The only DB access here is read-only
// (reference lookup); nothing is inserted into questions, no session, no dedup
// (those are specs 13/14). The ai/* modules stay pure; this service is where
// they meet the database.
const supabase = require('../../db/supabase');
const { chunkText } = require('../../ai/chunk');
const { generateQuestions } = require('../../ai/groq');
const { buildPrompt } = require('../../ai/prompts/questionGenerator');
const { validateGeneratedQuestion } = require('../utils/validate');

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Existing questions on the topic whose frozen Elo sits within ±threshold of the
// target (clamped 0-100) — style/difficulty exemplars, not a knowledge source.
// Plain range query, no embeddings. Zero matches is a valid result.
const getReferenceQuestions = async (topicId, targetElo, threshold = 10) => {
  const { data: topic, error: topicErr } = await supabase
    .from('topics')
    .select('topic_name, chapters!inner(chapter_name)')
    .eq('topic_id', topicId)
    .maybeSingle();
  if (topicErr) throw new Error(`reference topic lookup failed: ${topicErr.message}`);
  if (!topic) throw new Error(`topic ${topicId} not found`);

  const lo = clamp(targetElo - threshold, 0, 100);
  const hi = clamp(targetElo + threshold, 0, 100);
  const { data: referenceQuestions, error } = await supabase
    .from('questions')
    .select('question_text, correct_answer, explanation, elo_question')
    .eq('topic_id', topicId)
    .gte('elo_question', lo)
    .lte('elo_question', hi);
  if (error) throw new Error(`reference questions lookup failed: ${error.message}`);

  // PostgREST returns an object for a to-one embed, but guard the array shape too.
  const chapter = Array.isArray(topic.chapters) ? topic.chapters[0] : topic.chapters;
  return {
    topicName: topic.topic_name,
    chapterName: chapter ? chapter.chapter_name : null,
    referenceQuestions: referenceQuestions || [],
  };
};

// Chunks-based orchestrator: reference lookup -> prompt -> generate -> validate
// each item. Returns a summary; writes nothing anywhere. Spec 13 calls this with
// chunks already stored in session_chunks, so a document is chunked only once.
const generateFromChunks = async ({ topicId, targetElo, count, chunks }) => {
  const { topicName, chapterName, referenceQuestions } = await getReferenceQuestions(topicId, targetElo);

  const prompt = buildPrompt({ topicName, chapterName, chunks, referenceQuestions, targetElo, count });
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

// Spec 12 CLI entry: chunk the raw text, then delegate. Behaviour unchanged.
const generateCandidates = ({ topicId, targetElo, count, sourceText }) =>
  generateFromChunks({ topicId, targetElo, count, chunks: chunkText(sourceText) });

module.exports = { getReferenceQuestions, generateFromChunks, generateCandidates };
