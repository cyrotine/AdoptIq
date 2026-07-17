// Spec 12 — modular prompt builder for question generation. Kept separate from
// ai/groq.js (the API client) so the prompt can change without touching the
// client, per CLAUDE.md ("keep AI prompts modular"). Pure: no DB, no network.
//
// The chunks are the KNOWLEDGE source (what the questions are about); the
// reference questions are STYLE/DIFFICULTY exemplars (how hard, what shape).
// They enter the prompt in separate sections so the model never treats an
// exemplar as source material.

// The exact JSON shape the model must return. Embedded in the prompt text because
// JSON mode constrains validity, not shape (the backend validator is the guard).
const SCHEMA = {
  questions: [
    {
      question_text: 'string',
      option_a: 'string',
      option_b: 'string',
      option_c: 'string',
      option_d: 'string',
      correct_answer: 'one of "A", "B", "C", "D"',
      explanation: 'string — why the correct option is correct',
      elo_question: 'integer 0-100 (difficulty; higher = harder)',
      estimated_time: 'positive integer (seconds a typical student needs)',
    },
  ],
};

const buildPrompt = ({ topicName, chapterName, chunks, referenceQuestions, targetElo, count }) => {
  const knowledge = chunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');

  const exemplarSection = referenceQuestions.length
    ? `STYLE/DIFFICULTY EXEMPLARS (existing questions near the target difficulty — match their style and difficulty, do NOT reuse their content):\n${referenceQuestions
        .map((q) => `- (elo ${q.elo_question}) ${q.question_text}`)
        .join('\n')}`
    : 'No exemplar questions available; rely on the target difficulty number and the source material.';

  return [
    `You are an expert exam question author for the topic "${topicName}" (chapter "${chapterName}").`,
    `Write exactly ${count} multiple-choice question(s) answerable ONLY from the SOURCE MATERIAL below.`,
    `Target difficulty: elo_question near ${targetElo} on a 0-100 scale (higher = harder).`,
    '',
    'SOURCE MATERIAL (the knowledge to test):',
    knowledge,
    '',
    exemplarSection,
    '',
    'Rules:',
    '- Each question has exactly four options (option_a..option_d) and one correct_answer ("A", "B", "C", or "D").',
    '- Base every question and its correct answer strictly on the SOURCE MATERIAL — do not invent facts.',
    '- Give a short explanation for why the correct option is correct.',
    '- Set elo_question near the target and estimated_time to the seconds a typical student needs.',
    '',
    'Return ONLY a JSON object of this exact shape (no prose, no markdown):',
    JSON.stringify(SCHEMA, null, 2),
  ].join('\n');
};

module.exports = { buildPrompt, SCHEMA };
