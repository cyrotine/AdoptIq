# Spec 13 — Generation Session (stateful, DB-backed)

**Feature Number:** 13
**Feature Title:** Generation Session
**Feature Slug:** generation-session
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 11-admin-panel, 12-generation-core
**Unblocks:** 14-review-and-publish (accept/reject + permanent insert + Workspace UI),
15-iterative-session (Generate More + Chat)

---

## Overview

Spec 12 built a **stateless** generation core: point a CLI at a file, get
validated candidate questions printed, nothing persisted. Spec 13 makes it
**stateful and admin-triggered over HTTP**. An admin uploads a document, picks a
target Elo and a question count, and gets back a **generation session** — a
durable, DB-backed workspace that holds the processed document and the generated
candidates so later specs can review them (14) and iterate on them (15) without
re-processing anything.

Concretely, one authenticated request:

1. **Creates a session** row (admin, topic, target Elo).
2. **Processes the uploaded document once** — extract text (spec 12
   `ai/extract.js`), chunk it (spec 12 `ai/chunk.js`), **embed each chunk**
   (Gemini `text-embedding-004`, the first embedding use in the codebase), and
   store the chunks + embeddings in **ephemeral** `session_chunks`.
3. **Generates the first batch** — reuse spec 12's reference lookup + prompt +
   Groq call + validation, but sourced from the stored chunks, and land the valid
   candidates as **`pending`** rows in `session_questions`.
4. Returns the session and its pending candidates.

Plus the other end of the lifecycle: **finish** a session — mark it finished and
delete its ephemeral `session_chunks` (the heavy, re-derivable embedding rows).

This spec is **API + DB only**. It does **not** build:
- Any review / accept / reject behaviour or any write into the permanent
  `questions` table — that is spec 14, which also builds the **Generation
  Workspace UI**. Until then the admin panel's **Generate** button stays the
  no-op it has been since spec 11; sessions are exercised over HTTP (curl).
- **Generate More** or **Chat** — spec 15.

Per CLAUDE.md: business logic stays in services (`session.service.js`), routes
are thin, every field crossing the HTTP or AI boundary is re-validated, the two
AI providers keep their split (Groq generates, Gemini embeds — see spec 12's
"Model roles"), and no derivable data is stored (the difficulty band is still
derived from `elo_question`; `session_questions` mirrors the `questions` columns,
not a computed label).

---

## User Story

> As an AdaptIQ administrator, I want to upload a topic's notes, choose a target
> difficulty and how many questions I want, and get back a saved session
> containing candidate questions I can come back to — so the document is
> processed only once and the candidates persist for me to review and build on,
> rather than being printed once and lost.

---

## Functional Requirements

1. **Create session (authenticated, admin only).** `POST` with a multipart body:
   an uploaded file (`.pdf`/`.txt`/`.md`), a `topic_id`, a `target_elo`
   (0–100), and a `count`. A student token or no token → `401` (via
   `requireAdmin`). The topic must exist; bad/missing fields → `400` with a
   message, same contract as every other validator.
2. **Process the document exactly once**, at creation: extract → chunk → embed
   each chunk (Gemini `text-embedding-004`, 768-dim) → store every chunk with its
   embedding in `session_chunks`, keyed to the new session. A document that
   yields no text (e.g. a scanned PDF) → `422`, session not created (nothing to
   generate from).
3. **Generate the first batch** from the stored chunks: reference lookup
   (spec 12 `getReferenceQuestions`, Elo-range SQL, no vectors) → prompt →
   Groq (`llama-3.1-8b-instant`) → validate each candidate → insert the **valid**
   ones as `session_questions` with `status = 'pending'`. Invalid candidates are
   counted and dropped, never inserted (same "nothing silently kept" contract as
   spec 12).
4. **Return** `{ session, questions, summary }` where `summary` is
   `{ requested, generated, valid, invalid }` — the pending candidates plus the
   same accounting spec 12's CLI printed.
5. **Get session (admin only).** `GET /:id` returns the session and its
   `session_questions` (all statuses). `404` if the session doesn't exist; `401`
   without an admin token.
6. **Finish session (admin only).** `POST /:id/finish` sets `status = 'finished'`
   and `finished_on`, and **deletes that session's `session_chunks`** (the
   ephemeral embeddings). The session row and its `session_questions` remain as a
   record. Idempotent-ish: finishing an already-finished session is a no-op
   `200`, not an error. `401`/`404` as above.
7. **Ephemeral vs. durable.** `session_chunks` (text + embeddings) are ephemeral
   — deleted on finish. `generation_sessions` and `session_questions` persist.
   Deleting a session cascades to both child tables.
8. **No permanent question writes, no student-facing changes.** Nothing is
   inserted into `questions`; no student route or page changes. `session_questions`
   is a **staging** table only.

---

## How it builds on spec 12

Spec 12's stateless core is reused, not duplicated. Only the *source of chunks*
and the *destination of candidates* change:

| Concern | Spec 12 (stateless) | Spec 13 (session) |
|---|---|---|
| Text/chunks | chunked from a file per call | chunked **once**, stored in `session_chunks` |
| Reference questions | `getReferenceQuestions` (reused as-is) | `getReferenceQuestions` (reused as-is) |
| Prompt + Groq call | `buildPrompt` + `ai/groq.js` (reused) | `buildPrompt` + `ai/groq.js` (reused) |
| Validation | `validateGeneratedQuestion` (reused) | `validateGeneratedQuestion` (reused) |
| Candidates | returned in memory, printed | inserted as `pending` `session_questions` |
| Embeddings | none (chunks fed whole) | **each chunk embedded (Gemini) + stored** |

To avoid re-chunking stored chunks, spec 12's `generateCandidates` is refactored
to split out a chunks-based core:

- `generateFromChunks({ topicId, targetElo, count, chunks })` — reference lookup
  → prompt → Groq → validate → return the summary + candidates.
- `generateCandidates({ topicId, targetElo, count, sourceText })` becomes
  `generateFromChunks({ ..., chunks: chunkText(sourceText) })` — its CLI behaviour
  is unchanged.

`session.service.js` calls `generateFromChunks` with the session's stored chunk
`content`, so the document is chunked once (at upload) and never again.

---

## Embeddings: what they're for (and honest scope)

This is the codebase's **first embedding use**, so it's worth being precise. At
current content volume a single upload's chunks fit in one prompt, so spec 13's
**generation does not read the embeddings** — it feeds all of the session's
chunks to Groq. The embeddings are stored now as the **session memory
infrastructure** the later specs consume:

- **Spec 14** — semantic dedup: don't stage a candidate too similar to a question
  already accepted from this session (beyond spec 12's exact-text check).
- **Spec 15** — Chat: retrieve the chunks most relevant to a free-text steering
  instruction ("more on Bayes' theorem") instead of re-sending everything.

```
ponytail: session_chunks.embedding has no READER in spec 13 — its consumers are
spec 14 (semantic dedup) and 15 (chat retrieval). It's built here because the
user's architecture makes ephemeral session embeddings the reuse substrate, and
computing them at upload (once) is where they belong. If specs 14/15 slip, this
is the column to challenge. Chunk selection for generation stays "feed all" until
an upload is too big for one prompt.
```

pgvector is enabled here (spec 12 deliberately deferred it) — but scoped to the
**ephemeral** `session_chunks`, deleted on finish, never a permanent per-chapter
store (the thing spec 12 dropped from spec 10).

---

## Database Changes

Enable `pgvector` and add three tables, in `db/update.sql` (non-destructive,
`if not exists`) and mirrored into `db/schema.sql`:

```sql
create extension if not exists vector;

-- One row per generation session (spec 13). Durable; the workspace an admin
-- returns to. status: active while generating/reviewing, finished after cleanup.
create table if not exists generation_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  admin_id     uuid    not null references admins(admin_id),
  topic_id     integer not null references topics(topic_id),
  target_elo   smallint not null check (target_elo between 0 and 100),
  status       text    not null default 'active' check (status in ('active', 'finished')),
  created_on   timestamptz not null default now(),
  finished_on  timestamptz
);

-- Ephemeral processed document for a session (spec 13): one row per chunk, with
-- its Gemini embedding. Deleted on finish (re-derivable from the source file).
create table if not exists session_chunks (
  chunk_id    uuid primary key default gen_random_uuid(),
  session_id  uuid not null references generation_sessions(session_id) on delete cascade,
  content     text not null,
  embedding   vector(768) not null,
  created_on  timestamptz not null default now()
);
create index if not exists session_chunks_session_idx on session_chunks (session_id);

-- Staging table for generated candidates (spec 13). Mirrors the questions
-- columns (NOT a computed difficulty label — band is derived from elo_question).
-- status flows pending -> accepted|rejected in spec 14; here everything is pending.
create table if not exists session_questions (
  session_question_id uuid primary key default gen_random_uuid(),
  session_id     uuid not null references generation_sessions(session_id) on delete cascade,
  question_text  text not null,
  option_a       text not null,
  option_b       text not null,
  option_c       text not null,
  option_d       text not null,
  correct_answer char(1) not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanation    text,
  elo_question   smallint not null check (elo_question between 0 and 100),
  estimated_time integer,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_on     timestamptz not null default now()
);
create index if not exists session_questions_session_idx on session_questions (session_id);

grant all privileges on table generation_sessions to service_role;
grant all privileges on table session_chunks      to service_role;
grant all privileges on table session_questions   to service_role;
```

Design notes (honours "don't store derivable data"):
- `session_chunks` and `session_questions` are genuinely new information (a
  processed upload and its generated candidates), not derivable from any existing
  table.
- `session_questions` deliberately mirrors the `questions` columns so spec 14's
  accept step is a straight column copy — it stores no Easy/Medium/Hard label
  (still derived from `elo_question` at read time, spec 07).
- `on delete cascade` makes deleting a session the single cleanup lever.

---

## Backend Changes

- **`ai/gemini.js`** (new) — thin wrapper over `@google/generative-ai` (new
  dependency): `embed(text) -> Promise<number[]>` using `text-embedding-004`
  (768-dim). Reads `GEMINI_API_KEY`; **never logs or returns it**; throws if
  absent. Pure — no Supabase import. This is the Gemini half of the model split
  spec 12 reserved.
- **`backend/services/generation.service.js`** (edit) — refactor as above: add
  `generateFromChunks({ topicId, targetElo, count, chunks })`; `generateCandidates`
  delegates to it. No behaviour change for the spec-12 CLI.
- **`backend/services/session.service.js`** (new) — the session business logic:
  - `createSession({ adminId, topicId, targetElo, count, filePath })` — insert
    the session row; `extractText(filePath)` → `chunkText` → `embed` each chunk →
    bulk-insert `session_chunks`; if no text extracted, delete the session and
    signal `422`; then `generateFromChunks` off the stored chunk contents →
    bulk-insert valid candidates as `pending` `session_questions`; return
    `{ session, questions, summary }`.
  - `getSession(sessionId)` — session + its `session_questions`, or `404`.
  - `finishSession(sessionId)` — set `status='finished'`, `finished_on=now()`,
    delete that session's `session_chunks`; no-op if already finished; `404` if
    absent.
  - Returns the same `{ status, body }` shape the other services use.
- **`backend/controllers/session.controller.js`** (new) — `create`, `get`,
  `finish`. `create` reads the multipart file (from multer) + body fields, runs
  `validateSessionCreate`, calls the service, and **deletes the temp upload file
  in a `finally`** (nothing persists on disk). Thin; mirrors existing controllers.
- **`backend/routes/session.routes.js`** (new) — mounted at `/api/admin/sessions`,
  every route behind `requireAdmin`:
  - `POST /` (multer single-file middleware) → `create`
  - `GET /:id` → `get`
  - `POST /:id/finish` → `finish`
- **`backend/server.js`** — `app.use('/api/admin/sessions', sessionRoutes)`.
- **`backend/utils/validate.js`** — add
  `validateSessionCreate({ topic_id, target_elo, count })`: `topic_id` a positive
  integer, `target_elo` an integer 0–100, `count` an integer 1–20 (keeps a single
  request's Groq/embedding cost bounded — see Risks). File presence/type is
  enforced by multer + the controller. Error-string-or-null contract.
- **Dependencies** — add `@google/generative-ai` (embeddings) and `multer`
  (multipart upload) to `package.json`.
- **`.env.example`** — add `GEMINI_API_KEY=your-gemini-api-key`.

**Upload handling** — multer `diskStorage` into a scratch upload dir, preserving
the original extension so `extractText` dispatches correctly; the controller
unlinks the temp file after processing. `limits.fileSize` caps upload size;
`fileFilter` rejects anything but `.pdf/.txt/.md`. The file is never stored
long-term — only its extracted chunks (in `session_chunks`) are, and those are
ephemeral too.

## Frontend Changes

**None.** The Generation Workspace UI (upload form + candidate review) ships with
spec 14, where accept/reject gives it something to do. The admin panel's
**Generate** button remains a no-op in this spec.

## API Changes

All under `/api/admin/sessions`, all behind `requireAdmin` (student/no token →
`401`):

- **`POST /api/admin/sessions`** — multipart: `file`, `topic_id`, `target_elo`,
  `count`. → `201 { session, questions, summary }`. `400` invalid fields, `404`
  unknown topic, `422` no text extracted.
- **`GET /api/admin/sessions/:id`** — → `200 { session, questions }`, `404` if
  absent.
- **`POST /api/admin/sessions/:id/finish`** — → `200 { session }` (status
  `finished`, chunks deleted), `404` if absent.
- No student-facing route changes.

## AI Changes

- **Gemini `text-embedding-004`** is introduced for embeddings only — one
  `embed()` per chunk at upload. This is the codebase's first embedding use and
  completes spec 12's model split (Groq generates, Gemini embeds). No generation
  is moved to Gemini.
- **Groq `llama-3.1-8b-instant`** generation is reused unchanged via
  `generateFromChunks`.
- AI still returns structured JSON, is still re-validated at the backend, and
  still **never** touches the database: `ai/*` (including the new `ai/gemini.js`)
  have no Supabase import; only `session.service.js`/`generation.service.js`
  read/write the DB.

## RL Changes

None.

## Supabase Changes

Run the `db/update.sql` spec-13 section once: `create extension if not exists
vector`, then the three tables + grants. Non-destructive; safe to re-run.
`pgvector` must be available on the Supabase project (it is, natively).

## Data Flow

```
(admin, authenticated)
POST /api/admin/sessions   (multipart: file, topic_id, target_elo, count)
  requireAdmin -> req.adminId
  multer -> temp file path
  controller: validateSessionCreate(...) -> session.service.createSession(...)
    -> insert generation_sessions row                         -> session
    -> ai/extract.extractText(path)                           -> raw text  (422 if empty)
    -> ai/chunk.chunkText(text)                               -> chunks[]
    -> ai/gemini.embed(chunk) per chunk                       -> vectors
    -> insert session_chunks (content + embedding)            [ephemeral]
    -> generation.service.generateFromChunks({ topicId, targetElo, count, chunks }):
         getReferenceQuestions (Elo-range SQL, no vectors)
         buildPrompt -> ai/groq.generateQuestions (JSON mode)
         validateGeneratedQuestion per item
    -> insert valid candidates as session_questions (status 'pending')
  controller finally: unlink temp file
  -> 201 { session, questions, summary:{ requested, generated, valid, invalid } }

GET  /api/admin/sessions/:id       -> { session, questions }            (401/404)
POST /api/admin/sessions/:id/finish -> status='finished', delete session_chunks   (401/404)
```

---

## Risks

1. **Synchronous processing in one request.** Embedding N chunks + one Groq call
   happen inline, so `POST` latency scales with document size and `count`. Fine at
   `count ≤ 20` and small uploads; a background job + polling is the upgrade when
   uploads get large. `validateSessionCreate`'s count cap and multer's size cap
   bound it for now.
2. **Session embeddings have no reader yet.** First consumers are spec 14
   (semantic dedup) and 15 (chat retrieval). Built now as the session-memory
   substrate; flagged with a ponytail comment. If those specs change shape, this
   column is the thing to revisit.
3. **pgvector dependency.** The migration enables the extension; the project must
   allow it (Supabase does natively). Scoped to ephemeral `session_chunks` only —
   not the permanent store spec 12 dropped.
4. **Uploaded file on disk, briefly.** multer writes a temp file; the controller
   unlinks it in a `finally`. A crash mid-request could leave an orphan in the
   scratch dir — acceptable (scratch, re-derivable, no PII beyond the notes the
   admin chose to upload); a periodic sweep is a trivial later add. Size/type are
   capped by multer.
5. **Orphaned active sessions.** An admin who never calls finish leaves
   `session_chunks` (embeddings) lingering. Acceptable for a one-operator
   platform; a TTL sweep of old `active` sessions is a later add, not v1.
6. **Finishing discards candidates in this spec.** With no accept path yet
   (spec 14), a session's `pending` questions never reach `questions`; finishing
   just deletes the chunks and freezes the staging rows. Don't read anything into
   a finished spec-13 session beyond "processed, not yet promoted."
7. **`GEMINI_API_KEY` exposure.** Server-side only, from `.env`, never logged or
   returned — same rule as `GROQ_API_KEY` and every other credential.
8. **Cost.** Every chunk is a billed embedding call and every create is a billed
   Groq generation. The count cap and small-upload assumption keep a single
   session cheap; watch it if usage grows.

---

## Definition of Done

- [ ] `pgvector` + `generation_sessions` + `session_chunks` + `session_questions`
      exist in both `schema.sql` and `update.sql`; migration runs clean on
      Supabase and is re-runnable.
- [ ] `ai/gemini.js` reads `GEMINI_API_KEY`, throws if absent, never logs/returns
      it, and `embed()` returns a 768-length number array from
      `text-embedding-004`.
- [ ] `generation.service.generateFromChunks` exists and `generateCandidates`
      delegates to it; the spec-12 CLI still works unchanged.
- [ ] `POST /api/admin/sessions` with a real `.pdf` (or `.txt`) creates a session,
      stores one `session_chunks` row per chunk (each with an embedding), stages
      the valid candidates as `pending` `session_questions`, deletes the temp
      upload, and returns `{ session, questions, summary }`. A student/no token →
      `401`; unknown topic → `404`; a no-text file → `422` with no session left
      behind.
- [ ] `validateSessionCreate` rejects a non-positive `topic_id`, an out-of-range
      `target_elo`, and a `count` outside 1–20 — same rigor as existing
      validators.
- [ ] `GET /api/admin/sessions/:id` returns the session + its questions (`404`
      when absent); `POST /:id/finish` marks it finished and deletes its
      `session_chunks` (`session_questions` retained), and is a `200` no-op on an
      already-finished session.
- [ ] Self-check test (style of `ai/generation.test.js`, plain `assert`):
      `validateSessionCreate` accept + per-field reject cases. (DB/network paths —
      embeddings, Groq, Supabase — are exercised end-to-end via curl, not the
      unit test.)
- [ ] No permanent `questions` write; no student-facing page or route changed;
      the admin **Generate** button is still a no-op.

---

## Sources

- Spec 12 stateless core (reused wholesale) — `backend/services/generation.service.js`,
  `ai/groq.js`, `ai/chunk.js`, `ai/extract.js`, `ai/prompts/questionGenerator.js`,
  `backend/utils/validate.js` (`validateGeneratedQuestion`).
- Model split (Groq generate / Gemini embed) — spec 12 "Model roles",
  memory `model-split`.
- Admin gate + route/controller/service pattern — `backend/middleware/auth.middleware.js`
  (`requireAdmin`), `backend/routes/admin.routes.js`, `backend/controllers/admin.controller.js`,
  `backend/server.js`.
- Migration + grant pattern — `db/update.sql`, `db/schema.sql`.
- Gemini embeddings (`text-embedding-004`, 768-dim) — ai.google.dev/gemini-api/docs/embeddings
- Supabase pgvector columns — supabase.com/docs/guides/ai/vector-columns
- multer file upload — github.com/expressjs/multer
