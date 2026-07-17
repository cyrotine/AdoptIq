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

module.exports = { generateQuestions };
