// Spec 13 — thin wrapper over Gemini's REST embeddings endpoint. Completes the
// model split spec 12 reserved: Groq (llama-3.1-8b-instant) generates, Gemini
// embeds. Pure: no Supabase import. Uses Node's built-in fetch — no SDK dependency.
//
// Model: gemini-embedding-2. It defaults to 3072 dims, so we pin outputDimensionality
// to 768 to match the session_chunks vector(768) column + match_session_chunks RPC.
// pgvector uses cosine distance (scale-invariant), so no unit-normalization needed.
require('dotenv').config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY in environment');
}

// The key is read here and never logged or returned (errors carry status only,
// never the URL that includes the key).
const embed = async (text) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 768 }),
    },
  );
  if (!res.ok) throw new Error(`gemini embed failed: ${res.status}`);

  const json = await res.json();
  const values = json.embedding && json.embedding.values;
  if (!Array.isArray(values)) throw new Error('gemini embed returned no vector');
  return values; // number[768]
};

module.exports = { embed };
