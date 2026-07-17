// Spec 12 — pure paragraph-packing chunker (salvaged from spec 10). Splits text
// on blank lines into paragraphs, greedily packs them into ~180-word windows,
// and carries a ~30-word tail from each window into the next so a sentence that
// spans a paragraph break keeps context on both sides. No DB, no network.

const WORDS_PER_CHUNK = 180;
const OVERLAP_WORDS = 30;

const chunkText = (text) => {
  if (typeof text !== 'string' || !text.trim()) return [];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const chunks = [];
  let words = []; // words in the window currently being built
  const flush = () => {
    if (words.length) chunks.push(words.join(' '));
  };

  for (const para of paragraphs) {
    const paraWords = para.split(' ');
    // Adding this paragraph would overflow the window: close it out and start
    // the next window from the trailing overlap so context carries over.
    if (words.length && words.length + paraWords.length > WORDS_PER_CHUNK) {
      flush();
      words = words.slice(-OVERLAP_WORDS);
    }
    words.push(...paraWords);
  }
  flush();

  return chunks;
};

module.exports = { chunkText };
