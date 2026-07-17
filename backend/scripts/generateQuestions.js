// Spec 12 — dev CLI for the stateless generation core. Extracts text from a
// source file, generates candidate questions for one topic at a target Elo,
// validates them, and prints the result. Writes NOTHING to the database. Usage:
//   node backend/scripts/generateQuestions.js --topic <id> --elo <0-100> --count <n> --file <path>
const { extractText } = require('../../ai/extract');
const { generateCandidates } = require('../services/generation.service');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  const topicId = Number(arg('topic'));
  const targetElo = Number(arg('elo'));
  const count = Number(arg('count'));
  const file = arg('file');

  if (
    !Number.isInteger(topicId) || topicId < 1 ||
    !Number.isInteger(targetElo) || targetElo < 0 || targetElo > 100 ||
    !Number.isInteger(count) || count < 1 ||
    !file
  ) {
    console.error('Usage: node backend/scripts/generateQuestions.js --topic <id> --elo <0-100> --count <n> --file <path>');
    process.exit(1);
  }

  try {
    const sourceText = await extractText(file);
    if (sourceText.trim().length < 50) {
      console.error(`Warning: only ${sourceText.trim().length} characters extracted from ${file} — a scanned/image-only PDF? Generating from little or no text.`);
    }

    const result = await generateCandidates({ topicId, targetElo, count, sourceText });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Generation failed:', err.message);
    process.exit(1);
  }
})();
