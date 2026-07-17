// Spec 13 — generation session business logic. Process an upload once (extract ->
// chunk -> embed -> store), then generate a batch by RETRIEVAL: existing seed
// questions pull the most relevant chunks, and only those chunks reach the model.
// Candidates are returned transiently — nothing about them is stored. Only an
// ACCEPTED question is recorded (spec 14), and only as a link row into the
// permanent questions table (session_questions = session_id + question_id).
const supabase = require('../../db/supabase');
const { extractText } = require('../../ai/extract');
const { chunkText } = require('../../ai/chunk');
const { embed } = require('../../ai/gemini');
const { getSeedQuestions, generateFromChunks } = require('./generation.service');

// Service results are { status, body } — controllers just forward them.
const ok = (status, body) => ({ status, body });
const fail = (status, message) => ({ status, body: { error: message } });

// Retrieve the chunks to generate from: for each seed question, embed it and pull
// its top-5 most similar session chunks (match_session_chunks), unioned + deduped.
// No seeds (topic has no questions at all) -> fall back to the whole document.
const retrieveChunks = async (sessionId, seeds) => {
  if (!seeds || seeds.length === 0) {
    const { data, error } = await supabase
      .from('session_chunks').select('content').eq('session_id', sessionId);
    if (error) throw new Error(`chunk fallback fetch failed: ${error.message}`);
    return (data || []).map((r) => r.content);
  }

  const seen = new Set();
  const chunks = [];
  for (const seed of seeds) {
    const vector = await embed(seed.question_text);
    const { data, error } = await supabase.rpc('match_session_chunks', {
      target_session_id: sessionId,
      query_embedding: JSON.stringify(vector), // pgvector wants the '[..]' text form
      match_count: 5,
    });
    if (error) throw new Error(`chunk retrieval failed: ${error.message}`);
    for (const row of data || []) {
      if (!seen.has(row.chunk_id)) {
        seen.add(row.chunk_id);
        chunks.push(row.content);
      }
    }
  }
  return chunks;
};

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

  // Store the processed document: one embedded chunk per row (ephemeral — deleted
  // on finish). These embeddings are the retrieval store read just below.
  const chunkRows = [];
  for (const content of chunks) {
    const vector = await embed(content);
    chunkRows.push({ session_id: session.session_id, content, embedding: JSON.stringify(vector) });
  }
  const { error: chunkErr } = await supabase.from('session_chunks').insert(chunkRows);
  if (chunkErr) throw new Error(`session_chunks insert failed: ${chunkErr.message}`);

  // Retrieval-driven generation: seed questions -> top-5 chunks each -> generate.
  const seeds = await getSeedQuestions(topicId, targetElo);
  const retrieved = await retrieveChunks(session.session_id, seeds);
  const { requested, generated, valid, invalid, candidates } =
    await generateFromChunks({ topicId, targetElo, count, chunks: retrieved });

  // Candidates are transient: returned to the admin's browser, stored nowhere.
  return ok(201, { session, candidates, summary: { requested, generated, valid, invalid } });
};

const getSession = async (sessionId) => {
  const { data: session, error } = await supabase
    .from('generation_sessions').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  if (!session) return fail(404, 'session not found');

  // The only questions tied to a session are the ACCEPTED ones (spec 14), read
  // through the link table into the permanent questions bank. Empty until accept.
  const { data: links, error: qErr } = await supabase
    .from('session_questions').select('questions(*)').eq('session_id', sessionId);
  if (qErr) throw new Error(`session accepted-questions lookup failed: ${qErr.message}`);
  const acceptedQuestions = (links || []).map((l) => l.questions).filter(Boolean);

  return ok(200, { session, acceptedQuestions });
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
