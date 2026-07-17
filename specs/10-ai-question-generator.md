# Spec 10 — AI Question Generator (Chunking + RAG)

**Feature Number:** 10
**Feature Title:** AI Question Generator
**Feature Slug:** ai-question-generator
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 01-database-schema, 07-question-difficulty-cleanup

---

## Overview

Today `questions` is populated once, by hand, via `db/qns_seed.sql` — there is no
programmatic path that adds a row to it. This spec adds one: an AI agent that
reads chapter source material, chunks it, retrieves the chunks relevant to a
specific topic (RAG), and asks an LLM to author new multiple-choice questions
grounded in that retrieved text.

This is the Phase 3 "AI Question Generator" roadmap item. Per CLAUDE.md's AI
Principles, the agent **never writes to the database**. It returns structured
JSON; a backend service validates every field (same trust boundary as any other
untrusted input) and performs the insert. The LLM is also asked to propose the
new question's `elo_question` and `estimated_time` — this is the documented
"Difficulty Recommendation" AI use case, not a new allowance — and once
inserted, that Elo is **frozen at creation** exactly like a hand-written
question (spec 07); this spec does not reopen the (explicitly shelved, per the
0-attempt-volume finding) idea of a question's Elo moving after the fact.

There is no admin/teacher role or UI in the platform yet. Rather than build
authentication/RBAC and a review UI as a prerequisite (out of scope — nothing
in CLAUDE.md's MVP or current roadmap calls for it), this spec ships the
generator as an internal, developer-triggered script, the same pattern already
used by `db/test-connection.js`. Promoting it to an authenticated admin API is
a natural follow-up once a teacher-facing surface exists (see Risks).

---

## User Story

> As the person maintaining AdaptIQ's question bank, I want to feed in a
> chapter's source text and ask for N new questions on a specific topic, and
> have the system generate options grounded in that source, validate them the
> same way any other input is validated, and add them to the question bank —
> without hand-writing every question or trusting the AI to touch the database
> itself.

---

## Functional Requirements

1. **Ingest** a chapter's raw source text (plain text/markdown file) tied to an
   existing `chapter_id`, split it into overlapping chunks, embed each chunk,
   and store chunk + embedding. Re-running ingestion for the same chapter
   replaces its previous chunks (idempotent).
2. **Retrieve**, for a given `topic_id`, the `k` chunks (from that topic's own
   chapter only) most relevant to the topic, via embedding similarity — not the
   whole chapter's text and not a keyword match.
3. **Generate** `count` new questions from the retrieved chunks: `question_text`,
   four options, `correct_answer`, `explanation`, a proposed `elo_question`
   (0–100), a proposed `estimated_time` (seconds). Existing question texts for
   that topic are included in the prompt so the model steers away from repeats.
4. **Validate** every generated field on the backend before it can reach the
   database — type, range, and non-empty checks, identical in spirit to
   `validateGenerate`/`validateSubmit`. The AI boundary is trusted no more than
   a client request body.
5. **Deduplicate**: reject a generated question whose normalized text exactly
   matches an existing question already on that topic. (Fuzzy/near-duplicate
   detection is out of scope for v1 — see Risks.)
6. Only questions that pass validation and dedup are inserted into `questions`.
   The run reports `{ requested, generated, inserted, rejected, duplicates }` —
   nothing is silently dropped.
7. `elo_question` is written once, at insert, and is never revisited by this
   feature or any other — consistent with "Elo never changes Question
   Difficulty" (frozen at creation).
8. No student-facing surface changes. Newly inserted questions simply become
   eligible candidates the next time `quiz.service.generate()` queries that
   topic — no changes needed there.

---

## How chunking + RAG work here

**Chunking** (`ai/chunk.js`, pure function, no dependency): split source text on
paragraph breaks, then greedily pack paragraphs into ~180-word windows with a
~30-word trailing overlap so a sentence split across two paragraphs still has
context on both sides. No library needed — this is string splitting and array
packing.

**Embedding**: each chunk (and, at retrieval time, the query) is embedded with
Gemini's `text-embedding-004` (768 dims). Stored in a new `chapter_chunks` table
using Postgres `pgvector` (Supabase supports it natively; not yet enabled on
this project — this spec enables it).

**Retrieval**: a query string built from `topic_name` + `chapter_name` is
embedded, then a Postgres function does a cosine-similarity `ORDER BY ... LIMIT
k` **filtered to that topic's `chapter_id`** — chunks from unrelated chapters
are never candidates. At today's content volume (single-digit chapters, a few
hundred questions) this is a brute-force scan over a small, pre-filtered set;
no ANN index needed yet.

```
ponytail: brute-force cosine scan, no ivfflat/hnsw index. Add one once a
chapter's chunk count is large enough that the sequential scan shows up in
query time — not before.
```

**Generation**: retrieved chunks + topic/chapter names + existing question
texts for that topic go into one prompt (`ai/prompts/questionGenerator.js`),
asking Gemini for a JSON array of exactly `count` questions via structured
output (`responseSchema`), so the model can't return prose instead of JSON.

---

## Database Changes

New table, plus enabling `pgvector` (both non-destructive, in `db/update.sql`
and mirrored in `db/schema.sql`):

```sql
create extension if not exists vector;

create table chapter_chunks (
  chunk_id      uuid primary key default gen_random_uuid(),
  chapter_id    integer not null references chapters(chapter_id),
  content       text not null,
  embedding     vector(768) not null,
  created_on    timestamptz not null default now()
);

create index chapter_chunks_chapter_idx on chapter_chunks (chapter_id);

create or replace function match_chapter_chunks(
  query_embedding vector(768),
  target_chapter_id integer,
  match_count integer
) returns table (chunk_id uuid, content text, similarity float)
language sql stable as $$
  select chunk_id, content, 1 - (embedding <=> query_embedding) as similarity
  from chapter_chunks
  where chapter_id = target_chapter_id
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

Design notes (honours "don't store derivable data"):
- `chapter_chunks` stores the source text and its embedding — genuinely new
  information, not derivable from anything already in the schema.
- No new columns on `questions`. An AI-generated question is written through
  the exact same columns as a hand-written one (`elo_question`,
  `estimated_time` included) — nothing marks a row as "AI-authored" because
  nothing downstream needs to distinguish them; a frozen Elo is a frozen Elo
  regardless of origin.

---

## Backend Changes

- **`ai/chunk.js`** — pure `chunkText(text) -> string[]`, no DB, no network.
- **`ai/gemini.js`** — thin wrapper around `@google/generative-ai` (new
  dependency) exposing `embed(text)` and `generateQuestions(prompt, schema)`.
  Reads `GEMINI_API_KEY` from env; never logs it, never returns it.
- **`ai/prompts/questionGenerator.js`** — builds the prompt string from
  `{ topicName, chapterName, chunks, existingQuestionTexts, count }`. Kept
  separate from `ai/gemini.js` so the prompt can change without touching the
  API client (spec's "keep AI prompts modular" rule).
- **`ai/retrieve.js`** — `retrieveChunks(topicId, k)`: looks up the topic's
  `chapter_id`, embeds the topic/chapter query string, calls
  `match_chapter_chunks` via `supabase.rpc(...)`.
- **`backend/services/questionBank.service.js`** — the only place that writes
  to `questions`:
  - `ingestChapter(chapterId, text)`: chunk, embed each chunk, delete-then-insert
    that chapter's `chapter_chunks` rows.
  - `generateQuestions(topicId, count)`: retrieve → prompt → call Gemini →
    validate every returned question (`validateGeneratedQuestion`, new function
    in `backend/utils/validate.js`, mirroring existing validators) → normalize +
    dedup against existing `question_text` for that topic → bulk insert the
    survivors → return the `{ requested, generated, inserted, rejected,
    duplicates }` summary.
- **`backend/utils/validate.js`** — add `validateGeneratedQuestion(q)`: non-empty
  `question_text`/options/`explanation`, `correct_answer` in `A-D`,
  `elo_question` integer 0–100, `estimated_time` a positive integer. Same
  rejection contract as every other validator in the file.
- **`backend/scripts/generateQuestions.js`** — CLI entry point (mirrors
  `db/test-connection.js`): `node backend/scripts/generateQuestions.js --topic
  <id> --count <n>`. No new route/controller — see Risks for why.
- **`backend/scripts/ingestChapter.js`** — CLI: `node
  backend/scripts/ingestChapter.js --chapter <id> --file <path>`.
- **New dependency**: `@google/generative-ai` in `package.json`.

## Frontend Changes

None. This is a backend content-authoring pipeline; the result (new rows in
`questions`) is picked up automatically by the existing `generate()` quiz flow.

## API Changes

None. No new HTTP routes in this spec (CLI-triggered only — see Risks).

## AI Changes

This is the spec. Scope, per CLAUDE.md's AI Principles:
- Used only for **Question Generation** and **Difficulty Recommendation**
  (the proposed `elo_question`/`estimated_time`) — the two documented,
  allowed use cases this spec touches.
- AI always returns structured JSON (`responseSchema`-constrained), never
  free text parsed heuristically.
- AI never modifies database records directly — `ai/*` modules have no
  Supabase import; only `questionBank.service.js` does.

## RL Changes

None.

## Supabase Changes

Run the `db/update.sql` spec-10 section once: enables `pgvector`, creates
`chapter_chunks` and `match_chapter_chunks`. Non-destructive.

## Data Flow

```
(one-time per chapter)
chapter text file
  -> ai/chunk.js: chunkText()
  -> ai/gemini.js: embed() per chunk
  -> questionBank.service.ingestChapter(): store in chapter_chunks

(on demand, per topic)
generateQuestions(topicId, count)
  -> ai/retrieve.js: embed topic/chapter query
  -> match_chapter_chunks RPC, filtered to that chapter_id
  -> ai/prompts/questionGenerator.js: build prompt from chunks + existing Qs
  -> ai/gemini.js: generateQuestions() -> structured JSON array
  -> validateGeneratedQuestion() per item
  -> normalize + drop exact-text duplicates
  -> bulk insert survivors into `questions`
  -> return { requested, generated, inserted, rejected, duplicates }
```

---

## Risks

1. **No human review gate.** A validated, well-formed question can still be
   *factually wrong* (a plausible-sounding but incorrect `correct_answer` or
   `explanation`) — schema validation catches shape, not truth. Grounding
   generation in retrieved source text reduces this but doesn't eliminate it.
   MVP trade-off: spot-check generated batches before they see real students;
   a review/approval workflow is the natural upgrade once a teacher role
   exists.
2. **No admin auth yet.** Trigger is a local CLI script, not an API route —
   whoever has repo/server access can run it. Acceptable while the platform
   has no teacher-facing surface; promote to an authenticated route (with a
   real admin role) once one exists. Do not expose this as a public endpoint
   before then.
3. **Exact-match dedup only.** A paraphrased duplicate ("What is 2+2?" vs.
   "Compute the sum of 2 and 2.") won't be caught. Acceptable for v1; an
   embedding-similarity dedup check is the natural extension, using
   infrastructure this spec already adds.
4. **New external dependency + cost/latency.** Every chunk and every
   generation call is a billed, network-latency API call. `count` should stay
   small per invocation (tens, not hundreds) until real usage patterns are
   known.
5. **`GEMINI_API_KEY` exposure.** Server-side only, read from `.env`, never
   logged or returned in any response — same rule as every other credential
   in CLAUDE.md's Security Rules.

---

## Definition of Done

- [ ] `pgvector` enabled, `chapter_chunks` + `match_chapter_chunks` exist in
      both `schema.sql` and `update.sql`; migration runs clean on Supabase.
- [ ] `ingestChapter.js` chunks a real chapter text file and populates
      `chapter_chunks` with embeddings; re-running it replaces, not duplicates.
- [ ] `generateQuestions(topicId, count)` retrieves chapter-scoped chunks only,
      returns validated/deduped questions, and inserts exactly the survivors.
- [ ] `validateGeneratedQuestion` rejects out-of-range `elo_question`, bad
      `correct_answer`, empty text — same rigor as existing validators.
- [ ] Self-check test (style of `mastery.elo.test.js`): chunker produces
      overlapping windows from known input; validator accepts a well-formed
      question and rejects a bad one on each field; dedup drops an exact
      repeat.
- [ ] End-to-end manually: ingest one real chapter, generate a handful of
      questions for one of its topics, confirm they appear in `questions` and
      that a subsequent `generate()` quiz call can surface one of them.

---

## Sources

- Supabase pgvector — supabase.com/docs/guides/ai/vector-columns
- Gemini embeddings (`text-embedding-004`) — ai.google.dev/gemini-api/docs/embeddings
- Gemini structured output (`responseSchema`) — ai.google.dev/gemini-api/docs/structured-output
