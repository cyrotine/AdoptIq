# Spec 13 — Generation Session (stateful, retrieval-driven)

**Feature Number:** 13
**Feature Title:** Generation Session
**Feature Slug:** generation-session
**Branch:** main
**Status:** Implemented (reshaped for the retrieval-driven design)
**Depends on:** 11-admin-panel, 12-generation-core
**Unblocks:** 14-review-and-publish (accept/reject + Workspace UI),
15-iterative-session (Generate More + Chat)

---

## Overview

Spec 12 built stateless pieces and a feed-all-chunks CLI. Spec 13 makes
generation **stateful, admin-triggered over HTTP, and retrieval-driven**. An
admin uploads a document, picks a target Elo and count, and gets back a
**generation session** — a durable workspace holding the processed, embedded
document — plus a first batch of candidate questions produced by **RAG**:

1. **Create a session** row (admin, topic, target Elo).
2. **Process the document once** — extract → chunk → **embed each chunk** (Gemini
   `text-embedding-004`) → store chunks + embeddings in **ephemeral**
   `session_chunks`.
3. **Generate the first batch by retrieval:**
   - pick **seed questions** (spec 12 `getSeedQuestions`: Elo-band on the topic,
     else `k` topic questions);
   - for **each seed**, embed it and pull its **top 5** most-similar chunks from
     this session (`match_session_chunks`);
   - **union + dedup** the retrieved chunks;
   - feed **only those chunks** to Groq → validate → **candidates returned in the
     response**, held in the admin's browser. **Nothing about candidates is
     stored.**
4. **Finish** — mark the session finished and delete its ephemeral
   `session_chunks`.

The seed questions are **retrieval queries, not prompt content** — the model
never sees a whole question, only the chunks a question retrieved. This is the
first use of the `session_chunks` embeddings, and the reason they exist.

This spec is **API + DB only**. It does **not** build accept/reject or any write
to the permanent `questions` table (spec 14, which also builds the **Generation
Workspace UI**), nor **Generate More**/**Chat** (spec 15). Until spec 14 the
admin **Generate** button stays a no-op; sessions are exercised over curl.

**`session_questions` is defined here but written only in spec 14.** It is a thin
**link table** `(session_id, question_id)` recording the questions an admin
*accepts* — never a staging dump of generated candidates.

Per CLAUDE.md: logic in services, thin routes, every HTTP/AI-boundary field
re-validated, the Groq/Gemini split held (spec 12 "Model roles"), no derivable
data stored (an accepted question lives once, in `questions`; the link table only
references it).

---

## User Story

> As an AdaptIQ administrator, I want to upload a topic's notes, choose a target
> difficulty and how many questions I want, and get back candidate questions that
> were generated from the parts of my notes most relevant to the kind of
> questions this topic already has — with the document processed only once so I
> can keep building on the same session.

---

## Functional Requirements

1. **Create session (admin only).** `POST` multipart: a file (`.pdf/.txt/.md`),
   `topic_id`, `target_elo` (0–100), `count` (1–20). Student/no token → `401`
   (`requireAdmin`). Bad fields → `400`; unknown topic → `404`.
2. **Process once, at creation:** extract → chunk → embed each chunk (Gemini,
   768-dim) → store in `session_chunks`. A file yielding no text → `422`, no
   session created.
3. **Retrieval-driven first batch:**
   - `getSeedQuestions(topic, targetElo)` — Elo-band questions, else `k` topic
     questions;
   - each seed → `embed` → `match_session_chunks(session, embedding, 5)` → top-5
     chunks; **union + dedup** across seeds;
   - **fallback:** if there are **no seed questions at all** (topic has none),
     feed the whole document (all stored chunks);
   - `generateFromChunks` (spec 12) on the retrieved chunks → validate.
4. **Candidates are transient.** Returned as `{ session, candidates, summary }`
   where `summary = { requested, generated, valid, invalid }`. **No candidate is
   written to any table.** Invalid candidates are counted and dropped.
5. **Get session (admin only).** `GET /:id` → `{ session, acceptedQuestions }`,
   where `acceptedQuestions` are read through the `session_questions` link into
   `questions` (empty until spec 14 accepts any). `404` if absent.
6. **Finish session (admin only).** `POST /:id/finish` sets `status='finished'`,
   `finished_on`, and deletes that session's `session_chunks`. No-op `200` if
   already finished. `404`/`401` as above.
7. **Ephemeral vs. durable.** `session_chunks` (text + embeddings) are ephemeral
   (deleted on finish). `generation_sessions` and the `session_questions` link
   persist. Deleting a session cascades to both.
8. **No permanent `questions` write, no student-facing change.**

---

## How retrieval works here

```
POST /api/admin/sessions   (file, topic_id, target_elo, count)   [requireAdmin]
  createSession:
    insert generation_sessions
    extractText -> chunkText -> chunks[]          (422 if empty)
    embed(chunk) per chunk -> insert session_chunks (content + vector(768))
    seeds = getSeedQuestions(topic, targetElo)    (spec 12: Elo-band, else k topic Qs)
    retrieveChunks(session, seeds):
        for each seed: embed(seed.question_text)
                       match_session_chunks(session, embedding, 5)   -> top-5 chunks
        union + dedup                                                -> chunks[]
        (no seeds at all -> all session chunks)
    generateFromChunks({ topicId, targetElo, count, chunks })        (spec 12; CHUNKS ONLY)
  -> 201 { session, candidates, summary }          (candidates NOT stored)
```

- **`match_session_chunks(target_session_id, query_embedding, match_count)`** — a
  new pgvector function: cosine-nearest chunks **within one session**. Brute-force
  scan (small per-session chunk count; no ANN index yet).
- Seeds steer *which* chunks are used; their text never enters the prompt.
- pgvector is enabled here (spec 12 deferred it) — scoped to the **ephemeral**
  `session_chunks`, deleted on finish; never a permanent per-chapter store.

---

## Database Changes

Enable `pgvector`; add `generation_sessions`, `session_chunks`, the
`session_questions` **link table**, and `match_session_chunks` — in
`db/update.sql` (non-destructive) and `db/schema.sql`:

```sql
create extension if not exists vector;

create table generation_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  admin_id     uuid    not null references admins(admin_id),
  topic_id     integer not null references topics(topic_id),
  target_elo   smallint not null check (target_elo between 0 and 100),
  status       text    not null default 'active' check (status in ('active', 'finished')),
  created_on   timestamptz not null default now(),
  finished_on  timestamptz
);

-- Ephemeral processed document: one embedded chunk per row. Deleted on finish.
create table session_chunks (
  chunk_id    uuid primary key default gen_random_uuid(),
  session_id  uuid not null references generation_sessions(session_id) on delete cascade,
  content     text not null,
  embedding   vector(768) not null,
  created_on  timestamptz not null default now()
);
create index on session_chunks (session_id);

-- Retrieval: the match_count nearest chunks in a session to a query embedding.
create or replace function match_session_chunks(
  target_session_id uuid, query_embedding vector(768), match_count integer
) returns table (chunk_id uuid, content text, similarity float)
language sql stable as $$
  select chunk_id, content, 1 - (embedding <=> query_embedding) as similarity
  from session_chunks
  where session_id = target_session_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Accepted-question link (populated in spec 14). ONLY accepted questions, as a
-- reference into the permanent bank — no duplicated content, no candidate dump.
create table session_questions (
  session_id  uuid not null references generation_sessions(session_id) on delete cascade,
  question_id uuid not null references questions(question_id) on delete cascade,
  created_on  timestamptz not null default now(),
  primary key (session_id, question_id)
);
create index on session_questions (session_id);
```

Design notes:
- `session_chunks` is genuinely new information (a processed, embedded upload).
- `session_questions` stores **no** question content — an accepted question lives
  once in `questions`; this table only links it to the session that produced it
  (needed by spec 15's Generate More as retrieval seeds). Honours "never
  duplicate data".
- Generated-but-unaccepted candidates are stored **nowhere**.

---

## Backend Changes

- **`ai/gemini.js`** (new) — `embed(text)` via Gemini `text-embedding-004` REST
  endpoint (built-in `fetch`, no SDK). Reads `GEMINI_API_KEY`; never logs/returns
  it; throws if absent. Pure — no Supabase import.
- **`backend/services/generation.service.js`** (spec 12) — reused: `getSeedQuestions`
  drives retrieval; `generateFromChunks` generates from the retrieved chunks.
- **`backend/services/session.service.js`** (new):
  - `retrieveChunks(sessionId, seeds)` — embed each seed → `match_session_chunks`
    top-5 → union/dedup; no seeds → all session chunks.
  - `createSession({ adminId, topicId, targetElo, count, filePath })` — insert
    session; extract/chunk/embed/store (`422` on no text); retrieve; generate;
    return `{ session, candidates, summary }`. **No candidate persisted.**
  - `getSession(sessionId)` — session + accepted questions via the link table.
  - `finishSession(sessionId)` — mark finished, delete `session_chunks`; no-op if
    already finished.
- **`backend/controllers/session.controller.js`** (new) — `create`, `get`,
  `finish`; `create` reads the multer file + fields, runs `validateSessionCreate`,
  unlinks the temp file in `finally`.
- **`backend/routes/session.routes.js`** (new) — mounted at `/api/admin/sessions`,
  all behind `requireAdmin`: `POST /` (multer), `GET /:id`, `POST /:id/finish`.
- **`backend/server.js`** — `app.use('/api/admin/sessions', sessionRoutes)`.
- **`backend/utils/validate.js`** — `validateSessionCreate({ topic_id, target_elo,
  count })` (positive int / 0–100 / 1–20).
- **Dependencies** — `multer`. (Gemini uses built-in `fetch`; no SDK dependency.)
- **`.env.example`** — `GEMINI_API_KEY`.

**Upload handling** — multer `diskStorage` to the OS temp dir, extension
preserved; `fileFilter` allows `.pdf/.txt/.md`; `limits.fileSize` caps size; the
controller unlinks after processing. The file never persists.

## Frontend Changes

**None.** The Workspace UI ships with spec 14. The **Generate** button stays a
no-op.

## API Changes

All under `/api/admin/sessions`, behind `requireAdmin`:
- **`POST /`** — multipart → `201 { session, candidates, summary }`; `400`/`404`/`422`.
- **`GET /:id`** — `200 { session, acceptedQuestions }`; `404`.
- **`POST /:id/finish`** — `200 { session }` (finished, chunks deleted); `404`.

## AI Changes

- **Gemini `text-embedding-004`** — embeddings only: one `embed` per chunk at
  upload, and one per seed at retrieval. First embedding use; completes the model
  split.
- **Groq `llama-3.1-8b-instant`** — generation, reused from spec 12, now fed
  retrieval-narrowed chunks.
- AI still returns structured JSON, re-validated at the backend, and never touches
  the DB (`ai/*` have no Supabase import).

## RL Changes

None.

## Supabase Changes

Run the `db/update.sql` spec-13/14 section once: `create extension vector`, the
tables, and `match_session_chunks`. pgvector is available on Supabase natively.

## Data Flow

```
POST /api/admin/sessions (file, topic_id, target_elo, count)   requireAdmin -> req.adminId
  multer temp file
  validateSessionCreate -> createSession:
    insert generation_sessions
    extract -> chunk -> embed(chunk)* -> insert session_chunks       [ephemeral]
    seeds = getSeedQuestions(topic, targetElo)
    retrieveChunks: embed(seed)* -> match_session_chunks top5 -> union/dedup
                    (no seeds -> all chunks)
    generateFromChunks(retrieved chunks) -> validate
  finally: unlink temp file
  -> 201 { session, candidates, summary }        (candidates transient)

GET  /api/admin/sessions/:id        -> { session, acceptedQuestions }   (link table)
POST /api/admin/sessions/:id/finish -> finished, session_chunks deleted
```

---

## Risks

1. **Synchronous processing.** Embedding N chunks + M seeds + one Groq call run
   inline; `POST` latency scales with document size, seed count, and `count`. Fine
   at small scale (count ≤ 20, capped upload); a background job is the upgrade.
2. **Candidates aren't persisted.** They live only in the browser response; a
   reload before accepting loses the un-accepted ones (regenerate). Deliberate —
   only accepted questions are ever stored.
3. **pgvector dependency.** Enabled here, scoped to ephemeral `session_chunks`.
4. **Empty-seed fallback feeds everything.** A brand-new topic with no questions
   has no seeds, so the whole document is fed (no retrieval narrowing) — expected,
   and self-corrects once the topic has a few accepted questions.
5. **Uploaded file on disk briefly.** Unlinked in `finally`; a crash mid-request
   could orphan a temp file (scratch, re-derivable) — a sweep is a trivial add.
6. **Orphaned active sessions** leave `session_chunks` until finish; a TTL sweep
   is a later add.
7. **`GEMINI_API_KEY` exposure.** Server-side only, never logged/returned. The key
   is passed as a URL query param to Gemini's REST endpoint, so error messages
   carry status only — never the URL.
8. **Cost.** Every chunk and every seed is a billed embedding call; every create
   is a billed Groq call. Count cap + small uploads keep a session cheap.

---

## Definition of Done

- [ ] `pgvector`, `generation_sessions`, `session_chunks`, `match_session_chunks`,
      and the `session_questions` **link table** exist in `schema.sql` and
      `update.sql`; migration runs clean and re-runnable.
- [ ] `ai/gemini.js` reads `GEMINI_API_KEY`, throws if absent, never logs/returns
      it; `embed()` returns a 768-length array.
- [ ] `POST /api/admin/sessions` with a real file stores one embedded
      `session_chunks` row per chunk, generates from **retrieved** chunks (top-5
      per seed, deduped), and returns `{ session, candidates, summary }` **without
      writing any candidate**. Student/no token → `401`; unknown topic → `404`;
      no-text file → `422` with no session left behind.
- [ ] A topic with **no** questions falls back to feeding all chunks (no seeds).
- [ ] `validateSessionCreate` rejects bad `topic_id`/`target_elo`/`count`.
- [ ] `GET /:id` returns the session + accepted questions (empty pre-spec-14);
      `POST /:id/finish` marks finished, deletes `session_chunks`, no-op when
      already finished.
- [ ] Self-check test (`assert`): `validateSessionCreate` accept + per-field
      reject. (DB/network paths exercised via curl.)
- [ ] No permanent `questions` write; no student-facing change; Generate still a
      no-op.

---

## Sources

- Spec 12 core (reused) — `backend/services/generation.service.js` (`getSeedQuestions`,
  `generateFromChunks`), `ai/*`, `validateGeneratedQuestion`.
- Model split — spec 12 "Model roles", memory `model-split`.
- Admin gate + route/controller/service — `backend/middleware/auth.middleware.js`,
  `backend/routes/admin.routes.js`, `backend/server.js`.
- pgvector similarity — supabase.com/docs/guides/ai/vector-columns.
- Gemini embeddings — ai.google.dev/gemini-api/docs/embeddings.
- multer — github.com/expressjs/multer.
