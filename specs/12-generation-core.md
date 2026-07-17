# Spec 12 — Generation Core (AI plumbing + document processing)

**Feature Number:** 12
**Feature Title:** Generation Core
**Feature Slug:** generation-core
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 01-database-schema, 07-question-difficulty-cleanup, 11-admin-panel
**Supersedes (in part):** 10-ai-question-generator — see "Relationship to spec 10"
**Unblocks:** 13-generation-session (stateful session that reuses this core)

---

## Overview

This is the first of four specs (12→15) that turn the admin panel's no-op
**Generate** button into a working AI question-authoring workflow. Spec 12 builds
the **stateless core** only: the pieces that, given some source text and a target
difficulty, produce validated candidate questions **in memory** — no session
state, no UI, no database writes.

Concretely it delivers:

1. **Document processing** — extract plain text from an uploaded PDF (or a
   `.txt`/`.md` file), then split it into overlapping chunks.
2. **Reference lookup** — fetch existing questions on the same topic whose frozen
   Elo sits within a band of the requested target (plain SQL range query, **no
   vector search**). These are style/difficulty exemplars, not a knowledge
   source.
3. **Generation** — feed the chunks + reference questions + target Elo + count
   into one Groq (`llama-3.1-8b-instant`) JSON-mode call that returns a JSON array
   of candidate questions.
4. **Validation** — every generated field is validated on the backend, at the
   same trust boundary as any client request body, before it is considered a
   valid candidate.

The whole core is exercised end-to-end by **one CLI script** — the same
developer-triggered pattern as `backend/scripts/createAdmin.js`. Nothing here is
reachable over HTTP and nothing is inserted into `questions`; those arrive in
spec 13 (session state + admin API) and spec 14 (review + permanent insert).

Per CLAUDE.md's AI Principles: the AI is used only for **Question Generation**
and **Difficulty Recommendation** (the proposed `elo_question`/`estimated_time`),
always returns structured JSON, and **never touches the database** — every
`ai/*` module is pure (no Supabase import). The single read-only DB query in this
spec (reference lookup) lives in a service, not in `ai/`.

### Model roles (architecture-wide, specs 12–15)

Two providers, split by job — fixed for the whole generation workflow:

- **Groq `llama-3.1-8b-instant`** — every LLM/generation/chat call: question
  generation (this spec), Generate More, and the Chat steering feature (spec 15).
- **Gemini `text-embedding-004`** — embeddings **only** (spec 13's session chunk
  store and any later semantic dedup). Never used for text generation.

**Spec 12 therefore uses Groq only.** It embeds nothing — a single upload's
chunks fit in one prompt at current volume, so all chunks are fed directly. The
Gemini embedding client is introduced in spec 13, where embeddings are first
needed; it is deliberately absent here rather than shipped unused.

---

## Relationship to spec 10

Spec 10 ("AI Question Generator") was drafted but never implemented. Its design
**conflicts** with the session-based workflow specs 12–15 build, so it is not
implemented as written. This spec salvages the parts that still apply and drops
the parts that don't:

**Salvaged from spec 10 (built here):**
- `ai/chunk.js` — the pure paragraph-packing chunker (~180-word windows, ~30-word
  overlap).
- The idea of a thin LLM wrapper + modular prompt — but the model changes: spec
  10 generated via Gemini; here generation is a **Groq `llama-3.1-8b-instant`**
  call (`ai/groq.js`). Gemini is reserved for embeddings and does not appear in
  this spec (see Model roles).
- `ai/prompts/questionGenerator.js` — modular prompt builder.
- `validateGeneratedQuestion` in `backend/utils/validate.js`.

**Dropped (do NOT build):**
- The permanent `chapter_chunks` table + `pgvector` extension + `ingestChapter`
  CLI. In the new workflow, uploaded documents are **ephemeral, per generation
  session** (spec 13) — not a permanent per-chapter store.
- Semantic (embedding-similarity) retrieval of chunks / `match_chapter_chunks`
  RPC. Reference retrieval here is a plain Elo-range SQL query. At current
  content volume the chunker output for a single upload fits in one prompt, so
  chunks are **all fed** rather than semantically selected.
- The `questionBank.service.generateQuestions()` that inserts into `questions`.
  Insertion moves to the review/publish path (spec 14).

Spec 10 stays in `specs/` as historical context; its Definition of Done is
subsumed and re-scoped by 12–15.

---

## User Story

> As the developer maintaining AdaptIQ's question bank, I want to point a script
> at a chapter's notes (a PDF) and ask for N candidate questions on a specific
> topic at a target difficulty, and have the system extract the text, ground the
> questions in it, steer their style toward existing questions of similar
> difficulty, and validate every field — printing the candidates for me to
> inspect, without wiring anything into the app or writing to the database yet.

---

## Functional Requirements

1. **Extract text** from a source file: PDFs via a parser, `.txt`/`.md` read as-is.
   The result is a single plain-text string. Image-only/scanned PDFs (no text
   layer) yield little or no text — explicitly out of scope (see Risks).
2. **Chunk** the extracted text into overlapping ~180-word windows with a
   ~30-word trailing overlap, splitting on paragraph breaks first. Pure function,
   no DB, no network. Empty/whitespace input yields an empty array.
3. **Retrieve reference questions** for a given `topic_id` at a target Elo:
   every question on that topic whose `elo_question` is within `±threshold`
   (default 10, clamped to the 0–100 range) of the target. This is a plain
   `BETWEEN` query — **no embeddings, no similarity search**. Zero matches is a
   valid result (the model simply gets no exemplars).
4. **Generate** exactly `count` candidate questions via one Groq
   (`llama-3.1-8b-instant`) JSON-mode call. Each candidate has `question_text`,
   `option_a`–`option_d`,
   `correct_answer` (A–D), `explanation`, a proposed `elo_question` (0–100), and
   a proposed `estimated_time` (positive integer seconds). The prompt includes
   the chunks (knowledge source), the reference questions (style/difficulty
   exemplars), the topic/chapter names, and the target Elo.
5. **Validate** every generated candidate on the backend before it counts as
   valid: non-empty `question_text`/options/`explanation`, `correct_answer` in
   `A`–`D`, `elo_question` an integer 0–100, `estimated_time` a positive integer.
   Same reject-with-a-message contract as every other validator in
   `backend/utils/validate.js`.
6. The core returns an **in-memory summary** — `{ requested, generated, valid,
   invalid }` plus the array of valid candidates and the array of rejected ones
   with their reasons. Nothing is silently dropped; nothing is written anywhere.
7. A **CLI script** runs the full pipeline (extract → chunk → reference lookup →
   generate → validate) for one topic and prints the summary + candidates as
   JSON. No HTTP route, no controller, no DB write.
8. No student-facing surface changes. No admin API or UI changes. The admin
   panel's **Generate** button remains the no-op it is after spec 11.

---

## How the pieces fit

```
source file (.pdf/.txt/.md)
  → ai/extract.js: extractText()            (pure-ish: reads file, no DB/network)
  → ai/chunk.js: chunkText()                (pure)
                                            ┌─ generation.service.getReferenceQuestions()
                                            │    plain SQL: elo_question BETWEEN t-10 AND t+10
  → ai/prompts/questionGenerator.js ────────┘    (read-only DB, no vectors)
      buildPrompt({ topicName, chapterName, chunks, referenceQuestions, targetElo, count })
  → ai/groq.js: generateQuestions(prompt, schema)   (JSON-mode array, llama-3.1-8b-instant)
  → validateGeneratedQuestion() per item      (trust boundary)
  → { requested, generated, valid, invalid, candidates, rejected }  (in memory)
```

**Chunking** — split on blank lines into paragraphs, greedily pack into ~180-word
windows, carry a ~30-word tail from the previous window into the next so a
sentence spanning a paragraph break keeps context on both sides. String work
only; no library.

**Generation model** — Groq `llama-3.1-8b-instant` in JSON mode
(`response_format: { type: 'json_object' }`). The expected shape is described in
the prompt (`ai/prompts/questionGenerator.js` also exports it as a plain schema
object for the prompt text), and — because JSON mode guarantees valid JSON but
not a valid *shape* — every field is re-checked by `validateGeneratedQuestion`
downstream. That backend validation, not the model, is the trust boundary.

**No embeddings in this spec** — a single upload's chunks fit in one prompt at
current volume, so all chunks are fed directly; nothing is embedded. Gemini
(embeddings-only, per Model roles) is introduced in spec 13 when the session
chunk store first needs it — not shipped unused here.

**Reference vs. knowledge** — chunks are the **knowledge source** (what the
questions are about); reference questions are **style/difficulty exemplars** (how
hard, what shape). They enter the prompt in clearly separated sections so the
model never treats an exemplar as source material.

---

## Database Changes

**None.** No new tables, columns, functions, or extensions. Reference retrieval
reads the existing `questions`/`topics`/`chapters` tables. (This is the headline
difference from spec 10, which added `chapter_chunks` + `pgvector`.)

---

## Backend Changes

New `ai/` module directory (does not exist yet) — every file pure, no Supabase
import:

- **`ai/extract.js`** — `extractText(filePath) -> Promise<string>`. Dispatches on
  extension: `.pdf` via `pdf-parse`; `.txt`/`.md` read directly; anything else
  throws a clear error. No DB, no network.
- **`ai/chunk.js`** — `chunkText(text) -> string[]`. Pure paragraph-packing with
  overlap (salvaged from spec 10). No DB, no network.
- **`ai/groq.js`** — thin wrapper over `groq-sdk` (new dependency):
  - `generateQuestions(prompt) -> Promise<object[]>` — one `chat.completions`
    call to `llama-3.1-8b-instant` with `response_format: { type: 'json_object' }`,
    parses the returned JSON, and returns its `questions` array.
  - Reads `GROQ_API_KEY` from env; **never logs it, never returns it**. Throws if
    the key is missing.
  - No Gemini/embedding here — Gemini (embeddings-only) enters in spec 13.
- **`ai/prompts/questionGenerator.js`** — `buildPrompt({ topicName, chapterName,
  chunks, referenceQuestions, targetElo, count })` returns the prompt string
  (which spells out the exact JSON shape to return, since llama JSON-mode
  constrains validity but not shape). Kept separate from `ai/groq.js` so the
  prompt can change without touching the API client (CLAUDE.md: "keep AI prompts
  modular").

Service (read-only; the only DB access in this spec):

- **`backend/services/generation.service.js`** (new):
  - `getReferenceQuestions(topicId, targetElo, threshold = 10)` — resolves the
    topic's `topic_name`/`chapter_name`, then selects that topic's questions with
    `elo_question BETWEEN max(0, target-threshold) AND min(100, target+threshold)`.
    Returns `{ topicName, chapterName, referenceQuestions }`. Read-only.
  - `generateCandidates({ topicId, targetElo, count, sourceText })` — the
    in-memory orchestrator: chunk `sourceText`, call `getReferenceQuestions`,
    `buildPrompt`, `groq.generateQuestions`, `validateGeneratedQuestion` each
    item, and return `{ requested, generated, valid, invalid, candidates,
    rejected }`. **No insert, no session, no dedup** (dedup + insert are spec 14).

Validation:

- **`backend/utils/validate.js`** — add `validateGeneratedQuestion(q)` returning
  an error-message string or `null` (same contract as the existing validators):
  non-empty string `question_text`, `option_a`–`option_d`, `explanation`;
  `correct_answer` in `['A','B','C','D']`; `elo_question` an integer in 0–100;
  `estimated_time` a positive integer. Export it alongside the others.

CLI:

- **`backend/scripts/generateQuestions.js`** (new) — mirrors `createAdmin.js`'s
  `--flag` parsing:
  `node backend/scripts/generateQuestions.js --topic <id> --elo <n> --count <n> --file <path>`.
  Reads the file, calls `generation.service.generateCandidates`, prints the JSON
  summary + candidates. Exits non-zero on bad args or a thrown error. **Writes
  nothing.**

Dependencies / config:

- **`package.json`** — add `groq-sdk` and `pdf-parse`. (`@google/generative-ai`
  for embeddings is added in spec 13, where it is first used.)
- **`.env.example`** — add `GROQ_API_KEY=your-groq-api-key`. (`.env` is
  git-ignored; the real key is set locally, server-side only. `GEMINI_API_KEY`
  is added in spec 13.)

## Frontend Changes

**None.** This is a backend, CLI-triggered core. The admin panel's Generate
button stays a no-op until spec 14.

## API Changes

**None.** No new HTTP routes, controllers, or middleware. (Admin-gated routes
arrive in spec 13, when there is session state worth exposing.)

## AI Changes

This spec is the first AI integration in the codebase. Scope, per CLAUDE.md's AI
Principles:
- Used only for **Question Generation** and **Difficulty Recommendation** (the
  proposed `elo_question`/`estimated_time`), via Groq `llama-3.1-8b-instant`.
- Always returns structured JSON via JSON mode — never free text parsed
  heuristically. Backend `validateGeneratedQuestion` re-checks the shape (JSON
  mode guarantees valid JSON, not a valid shape).
- **Never** modifies database records: `ai/*` modules have no Supabase import;
  the one read-only query lives in `generation.service.js`; no write path exists
  in this spec at all.
- Model split (per Model roles): Groq for this generation; Gemini reserved for
  embeddings and not present in this spec.

## RL Changes

None.

## Supabase Changes

**None.** No migration to run. (No `pgvector`, no new tables — deliberately
unlike spec 10.)

## Data Flow

```
(developer, CLI, no persistence)
node backend/scripts/generateQuestions.js --topic 7 --elo 70 --count 5 --file notes.pdf
  → ai/extract.js extractText(notes.pdf)                         -> raw text
  → generation.service.generateCandidates({ topicId, targetElo, count, sourceText }):
      → ai/chunk.js chunkText(text)                              -> chunks[]
      → getReferenceQuestions(7, 70, 10)  [SQL: elo_question BETWEEN 60 AND 80]
                                                                 -> exemplars[]
      → ai/prompts/questionGenerator.js buildPrompt({...})       -> prompt
      → ai/groq.js generateQuestions(prompt)  [llama-3.1-8b-instant, JSON mode]
                                                                 -> candidate[]
      → validateGeneratedQuestion() per candidate                -> valid / rejected
  → print { requested, generated, valid, invalid, candidates, rejected }
(nothing written to questions, no session, no HTTP)
```

---

## Risks

1. **No human review gate, no persistence.** Candidates are printed, not stored
   or shown to students. Factual correctness is not guaranteed — schema
   validation checks shape, not truth. Grounding in the uploaded text reduces but
   doesn't eliminate wrong answers. The review/accept gate is spec 14; until
   then, candidates are for developer inspection only.
2. **Text-based PDFs only.** `pdf-parse` extracts an existing text layer; scanned
   or image-only PDFs yield little/no text (OCR is out of scope). The CLI should
   surface "little text extracted" clearly rather than silently generating from
   nothing.
3. **JSON mode ≠ shape guarantee.** `llama-3.1-8b-instant` in JSON mode returns
   syntactically valid JSON but may omit a field, add extras, or put an
   out-of-range Elo. `validateGeneratedQuestion` is the guard — a candidate that
   fails any field is rejected with a reason, never silently patched.
4. **New external dependency + cost/latency.** Every generation call is a billed,
   network-latency Groq request. Keep `count` small (single digits to low tens)
   per invocation until real usage is known.
5. **`GROQ_API_KEY` exposure.** Server-side only, read from `.env`, never logged
   or returned — same rule as every other credential in CLAUDE.md's Security
   Rules.
6. **Elo band may return zero exemplars** for a sparse topic. Acceptable: the
   prompt simply omits the exemplar section and relies on the target Elo number
   plus the source text. Not an error.

---

## Definition of Done

- [ ] `ai/extract.js` returns text from a real text-based PDF and from a `.txt`
      file; an unsupported extension throws a clear error.
- [ ] `ai/chunk.js` produces overlapping ~180-word windows from known input and
      an empty array from whitespace-only input.
- [ ] `getReferenceQuestions(topicId, target, 10)` returns only that topic's
      questions with `elo_question` in `[target-10, target+10]` (clamped 0–100),
      and resolves the topic/chapter names; zero matches is handled, not an error.
- [ ] `ai/groq.js` reads `GROQ_API_KEY`, throws if absent, and never logs or
      returns it; `generateQuestions` calls `llama-3.1-8b-instant` in JSON mode
      and returns a parsed array of candidate objects.
- [ ] `validateGeneratedQuestion` accepts a well-formed candidate and rejects, on
      each field independently, empty text/options/explanation, a bad
      `correct_answer`, an out-of-range `elo_question`, and a non-positive
      `estimated_time` — same rigor as existing validators.
- [ ] Self-check test (style of `mastery.elo.test.js`, plain `assert`, no
      framework): chunker overlap on known input; `validateGeneratedQuestion`
      accept + per-field reject cases. (Network calls — Groq — are exercised by
      the CLI end-to-end, not the unit test.)
- [ ] End-to-end manually: `node backend/scripts/generateQuestions.js --topic
      <id> --elo <n> --count <n> --file <notes.pdf>` prints a summary and the
      requested number of validated candidates grounded in the file — and writes
      nothing to the database.
- [ ] No student-facing page, admin API, or admin UI changed; the Generate
      button is still a no-op.

---

## Sources

- Existing CLI-script pattern — `backend/scripts/createAdmin.js`,
  `db/supabase.js` (env-based client).
- Existing validator contract (error-string-or-null) — `backend/utils/validate.js`.
- Frozen-Elo / difficulty-band derivation — spec 07, `quiz.service.js`
  `bandFromScore`.
- Groq JSON mode (`response_format: { type: 'json_object' }`) — console.groq.com/docs/text-chat#json-mode
- Groq `llama-3.1-8b-instant` model — console.groq.com/docs/models
- Gemini embeddings (`text-embedding-004`), reserved for spec 13 — ai.google.dev/gemini-api/docs/embeddings
- Superseded design context — `specs/10-ai-question-generator.md`.
