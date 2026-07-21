// Spec 12 — thin wrapper over groq-sdk for question generation. The only LLM
// client in the codebase; Groq (llama-3.1-8b-instant) handles all generation,
// Gemini (embeddings-only) arrives in spec 13. Pure: no Supabase import.
require('dotenv').config();
const Groq = require('groq-sdk');

if (!process.env.GROQ_API_KEY) {
  throw new Error('Missing GROQ_API_KEY in environment');
}

// The key is read here and never logged or returned.
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// One JSON-mode chat completion. JSON mode guarantees valid JSON but NOT a valid
// shape — every returned item is re-checked downstream by validateGeneratedQuestion.
const generateQuestions = async (prompt) => {
  const completion = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const content = completion.choices[0].message.content;
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
};

// Spec 15 — one JSON-mode completion for the grounded chat. Returns { reply,
// candidates } with safe defaults for missing/wrong-typed fields; candidates are
// re-validated downstream (JSON mode guarantees valid JSON, not a valid shape).
const generateChat = async (prompt) => {
  const completion = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return {
    reply: typeof parsed.reply === 'string' ? parsed.reply : '',
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
  };
};

module.exports = { generateQuestions, generateChat };
