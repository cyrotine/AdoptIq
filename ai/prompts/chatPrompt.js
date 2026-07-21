// Spec 15 — modular prompt builder for the grounded session chat. Kept separate
// from ai/groq.js (the client), like questionGenerator.js. Pure: no DB, no network.
//
// The chunks are the ONLY knowledge the model may use — they were retrieved for
// the admin's last message (RAG over session_chunks). The model answers in `reply`
// and, ONLY when the admin asks for questions, fills `candidates` with the same
// question shape the rest of the pipeline validates (SCHEMA, reused below).
const { SCHEMA } = require('./questionGenerator');

const buildChatPrompt = ({ topicName, chapterName, chunks, messages }) => {
  const knowledge = chunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');
  const transcript = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

  return [
    `You are an assistant helping an exam author work with notes on the topic "${topicName}" (chapter "${chapterName}").`,
    'Answer using ONLY the SOURCE MATERIAL below. If it does not cover the question, say so — do not invent facts.',
    '',
    'SOURCE MATERIAL (the only knowledge you may use):',
    knowledge,
    '',
    'CONVERSATION SO FAR (answer the last USER turn):',
    transcript,
    '',
    'Rules:',
    '- Put your prose answer to the admin in "reply".',
    '- Fill "candidates" ONLY when the admin asks you to write/generate questions; otherwise return "candidates": [].',
    '- Each candidate must be answerable strictly from the SOURCE MATERIAL, with exactly four options and one correct_answer ("A", "B", "C", or "D").',
    '- Set elo_question (0-100, higher = harder) and estimated_time (seconds a typical student needs).',
    '',
    'Return ONLY a JSON object of this exact shape (no prose, no markdown):',
    JSON.stringify({ reply: 'string — your answer to the admin', candidates: SCHEMA.questions }, null, 2),
  ].join('\n');
};

module.exports = { buildChatPrompt };
