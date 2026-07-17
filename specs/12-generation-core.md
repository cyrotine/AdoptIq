# Spec 12 — Generation Core (AI plumbing + document processing)

**Feature Number:** 12
**Feature Title:** Generation Core
**Feature Slug:** generation-core
**Branch:** main
**Status:** Implemented (reshaped for the retrieval-driven design)
**Depends on:** 01-database-schema, 07-question-difficulty-cleanup, 11-admin-panel
**Supersedes (in part):** 10-ai-question-generator — see "Relationship to spec 10"
**Unblocks:** 13-generation-session (stateful, retrieval-driven session that reuses this core)

---

## Overview

This is the first of four specs (12→15) that turn the admin panel's no-op
**Generate** button into a working AI question-authoring workflow. Spec 12 builds
the **pure pieces** and a **stateless CLI dev tool**: given source text and a
target difficulty, produce validated candidate questions **in memory** — no
session state, no UI, no database writes.

Concretely it delivers:

1. **Document processing** — extract plain text from an uploaded PDF (or a
   `.txt`/`.md` file), then split it into overlapping chunks.
2. **Seed selection** — a helper that finds existing questions on the topic to
   use as **retrieval seeds** (spec 13): first those within an Elo band of the
   target, falling back to any `k` questions on the topic. Seeds are questions
   used to *find relevant chunks* — they are **never fed to the model as text**.
3. **Generation from chunks** — feed a set of chunks + target Elo + count into one
   Groq (`llama-3.1-8b-instant`) JSON-mode call that returns a JSON array of
   candidates. **Only chunks reach the prompt.**
4. **Validation** — every generated field is validated on the backend before it
   counts as a valid candidate.

The core is exercised end-to-end by **one CLI script** — the same
developer-triggered pattern as `backend/scripts/createAdmin.js`. Because the CLI
has no embedded chunk store, it simply **feeds all chunks** of the file; the real
retrieval (embed a seed → find its top chunks) is a **session** capability and
lives in spec 13. Nothing here is reachable over HTTP and nothing is inserted
into `questions`.

Per CLAUDE.md's AI Principles: the AI is used only for **Question Generation**
and **Difficulty Recommendation** (the proposed `elo_question`/`estimated_time`),
always returns structured JSON, and **never touches the database** — every
`ai/*` module is pure (no Supabase import). The read-only DB queries in this spec
(topic context, seed selection) live in a service, not in `ai/`.

### Model roles (architecture-wide, specs 12–15)

Two providers, split by job — fixed for the whole generation workflow:

- **Groq `llama-3.1-8b-instant`** — every LLM/generation call (this spec),
  Generate More, and Chat (spec 15).
- **Gemini `text-embedding-004`** — embeddings **only** (spec 13's session chunk
  store + the retrieval that reads it). Never used for text generation.

**Spec 12 uses Groq only.** It embeds nothing — the CLI feeds chunks whole.
Embeddings and vector retrieval are introduced in spec 13, where the session
provides the embedded store to search.

---

## Relationship to spec 10

Spec 10 ("AI Question Generator") was drafted but never implemented. Its design
conflicts with the session-based workflow specs 12–15 build. Salvaged: the
chunker, the LLM-wrapper + modular-prompt idea (model changed to Groq), and the
generated-question validator. Dropped: the permanent `chapter_chunks` store,
`ingestChapter`, and its semantic-retrieval RPC (the session-scoped equivalent
arrives in spec 13). Spec 10 stays in `specs/` as historical context.

---

## User Story

> As the developer maintaining AdaptIQ's question bank, I want to point a script
> at a chapter's notes and ask for N candidate questions on a topic at a target
> difficulty, and have the system extract and chunk the text, generate questions
> grounded strictly in that text, and validate every field — printing the
> candidates for me to inspect, without wiring anything into the app or writing to
> the database yet.

---

## Functional Requirements

1. **Extract text** from a source file: PDFs via a parser, `.txt`/`.md` read as-is.
   Image-only/scanned PDFs yield little/no text — out of scope (see Risks).
2. **Chunk** the extracted text into overlapping ~180-word windows with a
   ~30-word trailing overlap, splitting on paragraph breaks first. Pure function.
   Empty/whitespace input → empty array.
3. **Select seed questions** for a topic at a target Elo: this topic's questions
   with `elo_question` within `±threshold` (default 10, clamped 0–100). If that
   band is **empty**, fall back to any `k` (default 5) questions on the topic.
   Empty result (topic has no questions at all) is valid — the caller then feeds
   all chunks. Seeds carry `question_text` for the caller (spec 13) to embed as a
   retrieval query; **seeds never enter the generation prompt**.
4. **Generate** exactly `count` candidate questions via one Groq
   (`llama-3.1-8b-instant`) JSON-mode call from a given set of **chunks** (the
   only source the model sees), plus the topic/chapter names and target Elo. Each
   candidate has `question_text`, `option_a`–`option_d`, `correct_answer` (A–D),
   `explanation`, a proposed `elo_question` (0–100), and a proposed
   `estimated_time` (positive integer seconds).
5. **Validate** every generated candidate: non-empty `question_text`/options/
   `explanation`, `correct_answer` in `A`–`D`, `elo_question` an integer 0–100,
   `estimated_time` a positive integer. Error-string-or-null contract, like every
   other validator.
6. Return an **in-memory summary** — `{ requested, generated, valid, invalid }`
   plus the valid candidates and the rejected ones with reasons. Nothing is
   silently dropped; nothing is written.
7. A **CLI script** runs the full pipeline (extract → chunk → generate from **all**
   chunks → validate) for one topic and prints the summary + candidates as JSON.
   No HTTP route, no DB write. (Retrieval-narrowed chunks are spec 13.)
8. No student-facing, admin-API, or admin-UI changes.

---

## How the pieces fit

```
source file (.pdf/.txt/.md)
  → ai/extract.js: extractText()            (pure-ish: reads file, no DB/network)
  → ai/chunk.js: chunkText()                (pure)  -> chunks[]

  generation.service.getTopicContext(topicId)     -> { topicName, chapterName }   (read-only DB)
  generation.service.getSeedQuestions(topicId, targetElo)                          (read-only DB)
      Elo-band questions on the topic, else k topic questions   -> seeds[]  (for spec 13 retrieval)

  → ai/prompts/questionGenerator.js buildPrompt({ topicName, chapterName, chunks, targetElo, count })
      CHUNKS ONLY — no question text in the prompt
  → ai/groq.js generateQuestions(prompt)   (llama-3.1-8b-instant, JSON mode)  -> candidate[]
  → validateGeneratedQuestion() per item   (trust boundary)
  → { requested, generated, valid, invalid, candidates, rejected }  (in memory)
```

**Chunking** — split on blank lines into paragraphs, greedily pack into ~180-word
windows, carry a ~30-word tail into the next so a sentence spanning a break keeps
context on both sides. String work only; no library.

**Seeds are queries, not content** — existing questions are used (in spec 13) to
retrieve the chunks most relevant to them; the questions themselves never go to
the model. Spec 12 only *selects* the seeds; spec 13 embeds them and retrieves.

**No embeddings in this spec** — the CLI feeds all chunks. Gemini embeddings +
`match_session_chunks` retrieval are spec 13.

---

## Database Changes

**None.** No new tables, columns, functions, or extensions. Topic-context and
seed lookups read the existing `topics`/`chapters`/`questions` tables.

---

## Backend Changes

New `ai/` module directory — every file pure, no Supabase import:

- **`ai/extract.js`** — `extractText(filePath)`. `.pdf` via `pdf-parse`;
  `.txt`/`.md` read directly; other extensions throw. No DB, no network.
- **`ai/chunk.js`** — `chunkText(text) -> string[]`. Pure paragraph-packing.
- **`ai/groq.js`** — `groq-sdk` wrapper: `generateQuestions(prompt)`, one
  `llama-3.1-8b-instant` JSON-mode completion, parses `.questions`. Reads
  `GROQ_API_KEY`; never logs/returns it; throws if absent.
- **`ai/prompts/questionGenerator.js`** — `buildPrompt({ topicName, chapterName,
  chunks, targetElo, count })`. **Chunks-only** (no reference-question exemplars).
  Also exports the `SCHEMA` shape spelled out in the prompt text.

Service (read-only; the DB access in this spec):

- **`backend/services/generation.service.js`**:
  - `getTopicContext(topicId)` → `{ topicName, chapterName }`.
  - `getSeedQuestions(topicId, targetElo, { threshold, k })` → Elo-band questions,
    else `k` topic questions (the seeds spec 13 retrieves from).
  - `generateFromChunks({ topicId, targetElo, count, chunks })` → topic context →
    `buildPrompt` → Groq → validate each → summary. No insert, no session.
  - `generateCandidates({ topicId, targetElo, count, sourceText })` — CLI dev
    tool: `chunkText(sourceText)` then `generateFromChunks` (feeds all chunks).

Validation:

- **`backend/utils/validate.js`** — `validateGeneratedQuestion(q)`
  (error-string-or-null), same rigor as existing validators.

CLI:

- **`backend/scripts/generateQuestions.js`** — `--topic --elo --count --file`;
  reads the file, calls `generateCandidates`, prints JSON. Writes nothing.

Dependencies / config:

- **`package.json`** — `groq-sdk`, `pdf-parse`.
- **`.env.example`** — `GROQ_API_KEY`.

## Frontend Changes

**None.** The Generation Workspace UI ships with spec 14; the admin **Generate**
button stays a no-op until then.

## API Changes

**None.** No HTTP routes. (Admin-gated session routes arrive in spec 13.)

## AI Changes

First AI integration. Groq `llama-3.1-8b-instant` for generation only; always
structured JSON re-validated at the backend; `ai/*` never touch the DB. Gemini
(embeddings) is reserved for spec 13.

## RL Changes

None.

## Supabase Changes

**None.** No migration. (pgvector + session tables arrive in spec 13.)

## Data Flow

```
node backend/scripts/generateQuestions.js --topic 7 --elo 70 --count 5 --file notes.pdf
  → extractText -> chunkText                                   -> chunks[]
  → generateFromChunks({ topicId, targetElo, count, chunks }):
      getTopicContext -> names
      buildPrompt(names, chunks, targetElo, count)   [CHUNKS ONLY]
      ai/groq.generateQuestions(prompt)              [JSON mode]  -> candidate[]
      validateGeneratedQuestion() per candidate                  -> valid / rejected
  → print { requested, generated, valid, invalid, candidates, rejected }
(no retrieval — CLI feeds all chunks; no DB write, no HTTP)
```

---

## Risks

1. **No human review, no persistence.** Candidates are printed only. Factual
   correctness isn't guaranteed — validation checks shape, not truth. The review
   gate is spec 14.
2. **Text-based PDFs only.** `pdf-parse` reads an existing text layer; scanned
   PDFs yield little/no text (OCR out of scope).
3. **JSON mode ≠ shape guarantee.** `validateGeneratedQuestion` is the guard; a
   candidate failing any field is rejected with a reason, never patched.
4. **Cost/latency.** Each generation is a billed Groq call — keep `count` small.
5. **`GROQ_API_KEY` exposure.** Server-side only, never logged/returned.
6. **CLI feeds all chunks.** Fine for a small file / dev testing; the product path
   (spec 13) narrows to retrieved chunks. Don't ship the CLI as the real path.

---

## Definition of Done

- [ ] `ai/extract.js` returns text from a text-based PDF and a `.txt`; unsupported
      extension throws.
- [ ] `ai/chunk.js` produces overlapping windows; whitespace-only → `[]`.
- [ ] `getSeedQuestions` returns the Elo-band questions, and falls back to `k`
      topic questions when the band is empty; empty topic → `[]` (not an error).
- [ ] `buildPrompt` contains the chunks and **no** question text.
- [ ] `ai/groq.js` reads `GROQ_API_KEY`, throws if absent, never logs/returns it;
      `generateQuestions` returns a parsed candidate array.
- [ ] `validateGeneratedQuestion` accepts a good candidate and rejects each bad
      field independently.
- [ ] Self-check test (`ai/generation.test.js`, plain `assert`): chunker overlap;
      validator accept + per-field reject. (Groq exercised via the CLI.)
- [ ] CLI prints a summary + validated candidates from a real file; writes
      nothing.
- [ ] No student page, admin API, or admin UI changed; Generate is still a no-op.

---

## Sources

- CLI/env patterns — `backend/scripts/createAdmin.js`, `db/supabase.js`.
- Validator contract — `backend/utils/validate.js`.
- Frozen-Elo / difficulty band — spec 07, `quiz.service.js` `bandFromScore`.
- Groq JSON mode + `llama-3.1-8b-instant` — console.groq.com/docs.
- Gemini embeddings (reserved for spec 13) — ai.google.dev/gemini-api/docs/embeddings.
- Superseded design — `specs/10-ai-question-generator.md`.
