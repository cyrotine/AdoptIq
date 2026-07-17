// Spec 13 — thin wrapper over Gemini's REST embeddings endpoint. Completes the
// model split spec 12 reserved: Groq (llama-3.1-8b-instant) generates, Gemini
// (text-embedding-004, 768-dim) embeds. Pure: no Supabase import. Uses Node's
// built-in fetch — no SDK dependency.
require('dotenv').config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY in environment');
}

// The key is read here and never logged or returned (errors carry status only,
// never the URL that includes the key).
const embed = async (text) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    },
  );
  if (!res.ok) throw new Error(`gemini embed failed: ${res.status}`);

  const json = await res.json();
  const values = json.embedding && json.embedding.values;
  if (!Array.isArray(values)) throw new Error('gemini embed returned no vector');
  return values; // number[768]
};

module.exports = { embed };
