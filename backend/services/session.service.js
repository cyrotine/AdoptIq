// Spec 13 — generation session business logic. Where the pure ai/* modules meet
// the database: process an upload once (extract -> chunk -> embed -> store), then
// stage the generated candidates. No permanent questions write (that is spec 14);
// session_questions is a staging table only.
const supabase = require('../../db/supabase');
const { extractText } = require('../../ai/extract');
const { chunkText } = require('../../ai/chunk');
const { embed } = require('../../ai/gemini');
const { generateFromChunks } = require('./generation.service');

// Service results are { status, body } — controllers just forward them.
const ok = (status, body) => ({ status, body });
const fail = (status, message) => ({ status, body: { error: message } });

const createSession = async ({ adminId, topicId, targetElo, count, filePath }) => {
  // Explicit topic check first: turns an FK violation into a clean 404 and avoids
  // inserting a session that can never generate.
  const { data: topic, error: topicErr } = await supabase
    .from('topics').select('topic_id').eq('topic_id', topicId).maybeSingle();
  if (topicErr) throw new Error(`topic lookup failed: ${topicErr.message}`);
  if (!topic) return fail(404, 'topic not found');

  // Process the document once. Nothing inserted yet, so no rollback on empty.
  const text = await extractText(filePath);
  const chunks = chunkText(text);
  if (chunks.length === 0) return fail(422, 'no text could be extracted from the document');

  const { data: session, error: sessionErr } = await supabase
    .from('generation_sessions')
    .insert({ admin_id: adminId, topic_id: topicId, target_elo: targetElo })
    .select().single();
  if (sessionErr) throw new Error(`session insert failed: ${sessionErr.message}`);

  // ponytail: session_chunks.embedding has no READER in spec 13 — its consumers
  // are spec 14 (semantic dedup) and 15 (chat retrieval). Computed once at upload,
  // where they belong. pgvector wants the '[..]' text form, hence JSON.stringify.
  const chunkRows = [];
  for (const content of chunks) {
    const vector = await embed(content);
    chunkRows.push({ session_id: session.session_id, content, embedding: JSON.stringify(vector) });
  }
  const { error: chunkErr } = await supabase.from('session_chunks').insert(chunkRows);
  if (chunkErr) throw new Error(`session_chunks insert failed: ${chunkErr.message}`);

  // Generation reuses spec 12 unchanged, sourced from the stored chunks.
  const { requested, generated, valid, invalid, candidates } =
    await generateFromChunks({ topicId, targetElo, count, chunks });

  let questions = [];
  if (candidates.length > 0) {
    const questionRows = candidates.map((c) => ({
      session_id: session.session_id,
      question_text: c.question_text,
      option_a: c.option_a,
      option_b: c.option_b,
      option_c: c.option_c,
      option_d: c.option_d,
      correct_answer: c.correct_answer,
      explanation: c.explanation,
      elo_question: c.elo_question,
      estimated_time: c.estimated_time,
    }));
    const { data: inserted, error: qErr } = await supabase
      .from('session_questions').insert(questionRows).select();
    if (qErr) throw new Error(`session_questions insert failed: ${qErr.message}`);
    questions = inserted;
  }

  return ok(201, { session, questions, summary: { requested, generated, valid, invalid } });
};

const getSession = async (sessionId) => {
  const { data: session, error } = await supabase
    .from('generation_sessions').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  if (!session) return fail(404, 'session not found');

  const { data: questions, error: qErr } = await supabase
    .from('session_questions').select('*').eq('session_id', sessionId);
  if (qErr) throw new Error(`session questions lookup failed: ${qErr.message}`);

  return ok(200, { session, questions });
};

const finishSession = async (sessionId) => {
  const { data: session, error } = await supabase
    .from('generation_sessions').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  if (!session) return fail(404, 'session not found');
  if (session.status === 'finished') return ok(200, { session }); // no-op

  const { data: finished, error: updErr } = await supabase
    .from('generation_sessions')
    .update({ status: 'finished', finished_on: new Date().toISOString() })
    .eq('session_id', sessionId)
    .select().single();
  if (updErr) throw new Error(`session finish failed: ${updErr.message}`);

  const { error: delErr } = await supabase
    .from('session_chunks').delete().eq('session_id', sessionId);
  if (delErr) throw new Error(`session_chunks cleanup failed: ${delErr.message}`);

  return ok(200, { session: finished });
};

module.exports = { createSession, getSession, finishSession };
