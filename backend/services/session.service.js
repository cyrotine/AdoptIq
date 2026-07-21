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
const { getSeedQuestions, generateFromChunks, getTopicContext } = require('./generation.service');
const { generateChat } = require('../../ai/groq');
const { buildChatPrompt } = require('../../ai/prompts/chatPrompt');
const { validateGeneratedQuestion } = require('../utils/validate');

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

  // Accepted questions are already permanent in `questions`; the session_questions
  // link rows only served as retrieval seeds for this session, so drop them too.
  const { error: linkDelErr } = await supabase
    .from('session_questions').delete().eq('session_id', sessionId);
  if (linkDelErr) throw new Error(`session_questions cleanup failed: ${linkDelErr.message}`);

  return ok(200, { session: finished });
};

// Dedup normalization: trim, lowercase, collapse internal whitespace — spec 12's
// "exact repeat" notion. Paraphrases are out of scope (semantic dedup is later).
const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');

// Accept a transient candidate: the only writer to the permanent questions table.
// The full candidate arrives from the client, so this is a real trust boundary —
// re-validate, and take topic_id from the SESSION (never the body).
const acceptQuestion = async (sessionId, candidate) => {
  const { data: session, error } = await supabase
    .from('generation_sessions').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  if (!session) return fail(404, 'session not found');
  if (session.status === 'finished') return fail(409, 'session is finished');

  const bad = validateGeneratedQuestion(candidate);
  if (bad) return fail(400, bad);

  // Exact-text dedup on the session's topic. ponytail: O(n) in-memory scan of the
  // topic's questions; fine at this scale, a generated-column/index upgrade if a
  // topic ever holds thousands of questions.
  const { data: existing, error: dupErr } = await supabase
    .from('questions').select('question_text').eq('topic_id', session.topic_id);
  if (dupErr) throw new Error(`dedup lookup failed: ${dupErr.message}`);
  const target = normalize(candidate.question_text);
  if ((existing || []).some((q) => normalize(q.question_text) === target))
    return fail(409, 'duplicate');

  const { data: question, error: insErr } = await supabase
    .from('questions')
    .insert({
      question_text: candidate.question_text,
      option_a: candidate.option_a,
      option_b: candidate.option_b,
      option_c: candidate.option_c,
      option_d: candidate.option_d,
      correct_answer: candidate.correct_answer,
      explanation: candidate.explanation,
      elo_question: candidate.elo_question, // frozen at creation (spec 07)
      estimated_time: candidate.estimated_time,
      topic_id: session.topic_id, // authoritative from the session, not the body
    })
    .select().single();
  if (insErr) throw new Error(`question insert failed: ${insErr.message}`);

  // Link row — spec 15's Generate More reads this as extra retrieval seeds.
  const { error: linkErr } = await supabase
    .from('session_questions')
    .insert({ session_id: sessionId, question_id: question.question_id });
  if (linkErr) throw new Error(`session_questions insert failed: ${linkErr.message}`);

  return ok(201, { question });
};

// The session's accepted questions, as lightweight retrieval seeds (spec 15).
// Same link-table read as getSession, but selecting only the seed fields.
const getAcceptedSeeds = async (sessionId) => {
  const { data: links, error } = await supabase
    .from('session_questions')
    .select('questions(question_id, question_text, elo_question)')
    .eq('session_id', sessionId);
  if (error) throw new Error(`accepted seeds lookup failed: ${error.message}`);
  return (links || []).map((l) => l.questions).filter(Boolean);
};

// Load a session or return the standard 404/409 result. Active = not finished.
const loadActiveSession = async (sessionId) => {
  const { data: session, error } = await supabase
    .from('generation_sessions').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  if (!session) return { session: null, result: fail(404, 'session not found') };
  if (session.status === 'finished') return { session, result: fail(409, 'session is finished') };
  return { session, result: null };
};

// Spec 15 — another batch within an active session, no re-upload. Seeds = topic
// Elo-band ∪ this session's accepted questions, so accepted questions steer what
// the next batch retrieves. Candidates matching accepted text are pre-dropped;
// nothing is stored (Accept remains the only writer).
const generateMore = async (sessionId, { count, targetElo }) => {
  const { session, result } = await loadActiveSession(sessionId);
  if (result) return result;

  const elo = targetElo ?? session.target_elo;
  const topicSeeds = await getSeedQuestions(session.topic_id, elo);
  const acceptedSeeds = await getAcceptedSeeds(sessionId);

  // Union topic + accepted seeds, dedup by question_id, cap to bound embed calls.
  const seen = new Set();
  const seeds = [];
  for (const s of [...topicSeeds, ...acceptedSeeds]) {
    if (!seen.has(s.question_id)) {
      seen.add(s.question_id);
      seeds.push(s);
    }
  }
  const chunks = await retrieveChunks(sessionId, seeds.slice(0, 10));

  const { requested, generated, valid, invalid, candidates } =
    await generateFromChunks({ topicId: session.topic_id, targetElo: elo, count, chunks });

  // Pre-dedup against accepted text so obvious repeats don't clutter review;
  // Accept's exact-text dedup remains the backstop. Reuses seeds already fetched.
  const acceptedTexts = new Set(acceptedSeeds.map((s) => normalize(s.question_text)));
  const fresh = candidates.filter((c) => !acceptedTexts.has(normalize(c.question_text)));

  return ok(201, { candidates: fresh, summary: { requested, generated, valid, invalid } });
};

// Spec 15 — grounded chat over the session's document. The last user message is
// the retrieval query; only the chunks it pulls reach the model. A turn returns
// prose (reply) and, when the admin asked for questions, validated candidates.
const chat = async (sessionId, messages) => {
  const { session, result } = await loadActiveSession(sessionId);
  if (result) return result;

  const query = messages[messages.length - 1].content;
  const vector = await embed(query);
  const { data, error } = await supabase.rpc('match_session_chunks', {
    target_session_id: sessionId,
    query_embedding: JSON.stringify(vector),
    match_count: 6,
  });
  if (error) throw new Error(`chat retrieval failed: ${error.message}`);
  const chunks = (data || []).map((r) => r.content);

  const { topicName, chapterName } = await getTopicContext(session.topic_id);
  const prompt = buildChatPrompt({ topicName, chapterName, chunks, messages });
  const { reply, candidates } = await generateChat(prompt);

  const valid = [];
  let invalid = 0;
  for (const c of candidates) {
    if (validateGeneratedQuestion(c)) invalid += 1;
    else valid.push(c);
  }

  return ok(200, { reply, candidates: valid, summary: { generated: candidates.length, valid: valid.length, invalid } });
};

module.exports = { createSession, getSession, finishSession, acceptQuestion, normalize, generateMore, chat };
