# Spec 15 — Iterative Session (Generate More + grounded Chat)

**Feature Number:** 15
**Feature Title:** Iterative Session
**Feature Slug:** iterative-session
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 12-generation-core, 13-generation-session, 14-review-and-publish
**Unblocks:** — (completes the 12→15 generation arc)

---

## Overview

Specs 12–14 built a **one-shot** authoring flow: upload a document → one
retrieval-driven batch of candidates → Accept/Reject → Finish. The document is
processed **once** into the ephemeral `session_chunks` store, but the admin only
ever sees that first batch. Spec 15 makes an open session **iterative** — two new
capabilities on an already-active session, with **no re-upload and no
re-embedding of the document**:

1. **Generate More.** Produce another batch of candidates within the same active
   session, reusing the stored `session_chunks`. The new part: the session's
   **accepted questions** (read through the `session_questions` link table that
   spec 14 populates) are used as **additional retrieval seeds**, alongside the
   topic's Elo-band seeds. This **closes the loop** — every question the admin
   accepts steers what the next batch retrieves from the notes toward.

2. **Chat.** A conversation with the model **grounded strictly in the session's
   document** (RAG over `session_chunks`). The admin can ask about the notes
   ("does this cover the Calvin cycle?") **and** ask the model to author questions
   conversationally ("give me 3 harder ones on the light reactions"). A chat turn
   returns a text `reply` **and, when asked, candidate questions** that flow into
   the **same Accept/Reject review cards** as every other candidate.

Both capabilities produce **transient** candidates (held in the browser, stored
nowhere) exactly like spec 13. The **only** writer to the permanent `questions`
table is still spec 14's Accept — Generate More and Chat just produce more
candidates to review. The model still **never writes to the DB**.

**Key property:** these run only while a session is **active**. Finishing a
session deletes its `session_chunks` (spec 13), so Generate More and Chat require
the chunks to still exist → both `409` on a finished session.

**Scope — this spec does NOT build:**
- Any **schema change** — reuses `session_chunks`, `session_questions`,
  `questions`, and `match_session_chunks`, all from specs 13/14.
- **Persisting chat history** — the conversation is transient (browser-held, sent
  back each turn), matching spec 13's "candidates aren't persisted".
- **Editing** candidates, **semantic** dedup, or any student-facing change.

---

## User Story

> As an AdaptIQ administrator mid-way through a generation session, I want to keep
> generating more questions from the notes I already uploaded — steered by the
> questions I've accepted so far — and to chat with the model about those notes to
> pull out exactly the questions I want, without re-uploading anything, so a single
> session becomes a productive back-and-forth instead of a one-shot batch.

---

## Functional Requirements

1. **Generate More (admin only).** `POST /api/admin/sessions/:id/generate-more`
   with `{ count (1–20), target_elo? (0–100) }`. Behind `requireAdmin`.
   - Session must exist and be `active`; else `404` / `409` (finished — chunks
     gone).
   - `target_elo` defaults to the **session's** stored `target_elo` when omitted.
   - **Seeds = topic Elo-band seeds (spec 12 `getSeedQuestions`) ∪ this session's
     accepted questions** (via `session_questions` → `questions`), deduped by
     `question_id`, capped (default 10) to bound embed calls.
   - Retrieve chunks for those seeds (spec 13 `retrieveChunks`: embed each seed →
     `match_session_chunks` top-5 → union/dedup; **no seeds → all session
     chunks**), then `generateFromChunks` (spec 12) → validate.
   - **Pre-dedup:** drop any candidate whose normalized `question_text` already
     matches an accepted question on the topic (spec 14 `normalize`), so obvious
     repeats don't clutter review. (Accept's dedup remains the backstop.)
   - Return `201 { candidates, summary }`, `summary = { requested, generated,
     valid, invalid }`. **Nothing stored.**
2. **Chat (admin only).** `POST /api/admin/sessions/:id/chat` with `{ messages:
   [{ role: 'user' | 'assistant', content }] }` (the transient conversation so
   far, last message from `user`). Behind `requireAdmin`.
   - Session must exist and be `active`; else `404` / `409`.
   - Validate the messages shape → `400` on a bad/empty conversation.
   - **Grounding:** embed the **last user message** → `match_session_chunks` top-k
     (default 6) → those chunks are the only knowledge the model may use.
   - One Groq call returns `{ reply, candidates }`: `reply` is prose answering the
     admin; `candidates` is a (possibly empty) array of question objects — non-empty
     **only when the admin asked for questions**. Each candidate is validated with
     `validateGeneratedQuestion`; invalid ones are dropped and counted.
   - Return `200 { reply, candidates, summary }`.
3. **Candidates are transient** in both endpoints — returned in the response,
   written to no table. Only spec 14's Accept persists a question.
4. **Both require an active session.** After Finish (chunks deleted), both `409`.
5. **Workspace UI additions (admin only)** in the existing
   `GenerationWorkspace` page:
   - a **Generate More** control (count + optional target Elo) that appends the
     new candidates to the review list;
   - a **Chat panel** (message thread + input) showing the running conversation;
     any candidates a chat turn returns render as the **same Accept/Reject cards**.
   - loading / error states for both; chat history + candidates live in React
     state (lost on reload — deliberate).
6. **No student-facing change** and **no new writer** to `questions` beyond spec
   14's Accept.

---

## How the pieces fit

```
POST /api/admin/sessions/:id/generate-more   { count, target_elo? }   [requireAdmin]
  session.service.generateMore:
    load session (active? else 404/409)
    elo = target_elo ?? session.target_elo
    topicSeeds    = getSeedQuestions(topic, elo)                 (spec 12)
    acceptedSeeds = session_questions -> questions               (accepted so far)
    seeds = dedup(topicSeeds ∪ acceptedSeeds) capped at 10
    chunks = retrieveChunks(session, seeds)                      (spec 13; all chunks if no seeds)
    { candidates, summary } = generateFromChunks({ topicId, elo, count, chunks })   (spec 12)
    drop candidates whose normalize(text) matches an accepted question   (spec 14 normalize)
  -> 201 { candidates, summary }        (nothing stored)

POST /api/admin/sessions/:id/chat   { messages }   [requireAdmin]
  session.service.chat:
    load session (active? else 404/409)
    validateChatMessages(messages)                              -> 400
    q = last user message
    chunks = match_session_chunks(session, embed(q), 6)         (spec 13 retrieval)
    prompt = buildChatPrompt({ topicName, chapterName, chunks, messages })
    { reply, candidates } = groq.generateChat(prompt)           (JSON mode)
    validate each candidate; drop invalid                       (spec 12 validator)
  -> 200 { reply, candidates, summary }
```

- **Generate More reuses everything:** `getSeedQuestions` + `retrieveChunks` +
  `generateFromChunks` already exist; the only new logic is unioning the accepted
  questions into the seed set and the pre-dedup filter.
- **Chat is grounded like retrieval:** the admin's message is the query embedding;
  only the chunks it retrieves reach the prompt — the model can't answer from
  outside the uploaded notes.
- **Two candidate paths, one review gate:** Generate More and Chat both funnel
  candidates through `validateGeneratedQuestion` and the spec-14 Accept endpoint —
  no second write path, no second validator.

---

## Database Changes

**None.** Reuses `session_chunks` (retrieval + chat grounding),
`match_session_chunks` (spec 13), `session_questions` → `questions` (accepted
seeds, spec 14). No new table, column, function, or extension.

---

## Backend Changes

- **`ai/groq.js`** (edit) — add `generateChat(prompt)`: one `llama-3.1-8b-instant`
  JSON-mode completion parsed into `{ reply: string, candidates: array }` with
  safe defaults (`reply: ''`, `candidates: []`) when a field is missing. Mirrors
  `generateQuestions`; still reads `GROQ_API_KEY`, never logs/returns it.
- **`ai/prompts/chatPrompt.js`** (new) — `buildChatPrompt({ topicName,
  chapterName, chunks, messages })`. Grounds the model in the chunks, instructs it
  to answer in `reply` and to fill `candidates` **only when the user asks for
  questions**, reusing the question `SCHEMA` from `questionGenerator.js`. Pure —
  no DB, no network.
- **`backend/services/session.service.js`** (edit) — add:
  - `generateMore(sessionId, { count, targetElo })` — active-session guard,
    seed union (topic ∪ accepted, deduped/capped), `retrieveChunks`,
    `generateFromChunks`, accepted-text pre-dedup; returns `{ status, body }`.
  - `chat(sessionId, messages)` — active-session guard, embed last user message,
    `match_session_chunks`, `buildChatPrompt`, `generateChat`, validate candidates;
    returns `{ status, body }`.
  - a small `getAcceptedSeeds(sessionId)` reading `session_questions` →
    `questions(question_id, question_text, elo_question)`.
  - reuse the existing `retrieveChunks`, `normalize`, `ok`/`fail`.
- **`backend/controllers/session.controller.js`** (edit) — add `generateMore` and
  `chat`, parsing/validating the JSON body then forwarding the service result via
  the existing `send` helper.
- **`backend/routes/session.routes.js`** (edit) — add behind `requireAdmin`:
  `POST /:id/generate-more` and `POST /:id/chat` (both JSON, no multer).
- **`backend/utils/validate.js`** (edit) — add `validateGenerateMore({ count,
  target_elo })` (count 1–20; `target_elo` 0–100 **or** omitted) and
  `validateChatMessages(messages)` (non-empty array; each `{ role ∈
  ['user','assistant'], content: non-empty string }`; last role `user`).
  Error-string-or-null, same contract as the others.
- No new dependency.

## Frontend Changes

- **`frontend/src/lib/api.ts`** (edit) — add `generateMore(sessionId, { count,
  targetElo })` and `chat(sessionId, messages)` helpers (thin `api<T>` wrappers)
  plus `ChatMessage`, `ChatResponse`, `GenerateMoreResponse` types. Reuse the
  existing `Candidate` type.
- **`frontend/src/pages/GenerationWorkspace.tsx`** (edit) — on an active session
  add (a) a **Generate More** control (count + optional target Elo) that appends
  returned candidates to the existing review list, and (b) a **Chat panel**
  (message thread + text input) that appends each `reply` and renders any returned
  candidates as the **same Accept/Reject cards**. Chat history + candidates in
  React state; reuse the existing card + Accept/Reject handlers. Loading/error
  states for both.
- No new page, route, or change to `AdminPanel`/`App`.

## API Changes

Under `/api/admin/sessions`, behind `requireAdmin`:
- **`POST /:id/generate-more`** — `{ count, target_elo? }` → `201 { candidates,
  summary }`; `400` bad body; `409` finished; `404` unknown; `401` no admin token.
- **`POST /:id/chat`** — `{ messages }` → `200 { reply, candidates, summary }`;
  same `400/409/404/401`.
- Reuses spec-14 `POST /:id/accept` for publishing; spec-13 create/get/finish
  unchanged. No student-facing route change.

## AI Changes

- **Groq `llama-3.1-8b-instant`** — reused for Generate More (via
  `generateFromChunks`) and for Chat (new `generateChat`, JSON mode returning
  `{ reply, candidates }`). Structured JSON, re-validated at the backend, never
  touches the DB.
- **Gemini `text-embedding-004`** — reused: one embed per Generate More seed, one
  embed per chat turn (the last user message). No new model.
- Both new prompts are modular (`chatPrompt.js`), per CLAUDE.md.

## RL Changes

None.

## Supabase Changes

**None.** No migration — reuses spec-13/14 tables and `match_session_chunks`.

## Data Flow

```
(workspace, session already active from spec 14)

Generate More -> POST /:id/generate-more { count, target_elo? }
   seeds = topic Elo-band ∪ accepted-so-far  -> retrieveChunks -> generateFromChunks
   -> 201 { candidates } -> appended to the review list (Accept/Reject as spec 14)

Chat -> POST /:id/chat { messages }
   embed(last user msg) -> match_session_chunks top-6 -> buildChatPrompt -> generateChat
   -> 200 { reply, candidates } -> reply shown in thread; candidates -> review cards

Accept (unchanged, spec 14) -> inserts questions + session_questions link
   (which then feeds back as a Generate More seed next round)

Finish (unchanged, spec 13) -> session_chunks deleted -> Generate More/Chat now 409
```

---

## Risks

1. **Active-session only.** Finish deletes `session_chunks`, so both endpoints
   `409` afterward — the workspace must gate the controls on `status === 'active'`.
2. **Chat can hallucinate candidates.** Grounding narrows the source, and
   `validateGeneratedQuestion` guards shape, but not truth — the spec-14 human
   Accept gate remains the correctness backstop for anything a chat turn emits.
3. **Two candidate-producing paths.** Generate More and Chat both funnel through
   the one validator and the one Accept endpoint; accept-time dedup is the final
   backstop against repeats from either path.
4. **Chat history is transient.** Browser-held and re-sent each turn; a reload
   loses it (like candidates). Deliberate — no chat table, nothing derivable
   stored (CLAUDE.md).
5. **Cost / latency.** Each Generate More = up to 10 seed embeds + one Groq call;
   each chat turn = one embed + one Groq call. Seed cap + `count` cap keep it
   bounded; synchronous like spec 13 (a background job is the upgrade).
6. **Accepted-seed growth steers narrowly.** As more questions are accepted, the
   seed set leans toward what's already accepted; the topic Elo-band seeds and the
   seed cap keep some breadth.
7. **JSON mode ≠ shape guarantee for chat.** `generateChat` defaults missing
   fields (`reply:''`, `candidates:[]`); candidates are re-validated, never patched.
8. **Prompt content from chat is admin-supplied.** Admin-only surface; chat text
   only steers generation and is never executed, and model output reaches the DB
   only through the validated spec-14 Accept.

---

## Definition of Done

- [ ] `POST /:id/generate-more` on an active session returns a fresh
      `{ candidates, summary }` generated from **retrieved** chunks, using topic
      **and** accepted-question seeds, deduped against accepted text; writes
      nothing. `409` on a finished session; `404` unknown; `400` bad body; `401`
      no admin token.
- [ ] A session with accepted questions demonstrably uses them as extra seeds
      (accepted-question text influences which chunks are retrieved).
- [ ] `POST /:id/chat` returns a grounded `reply`; a question-asking turn also
      returns validated `candidates`; a plain-question turn returns
      `candidates: []`. Same `409/404/400/401`.
- [ ] Chat is grounded — the reply draws on the retrieved `session_chunks`, and
      candidates it emits pass `validateGeneratedQuestion` (invalid dropped/counted).
- [ ] The workspace shows a Generate More control and a Chat panel on an active
      session; new candidates from either append to the Accept/Reject list; Accept
      still publishes via spec 14; both controls disabled/hidden once finished.
- [ ] `validateGenerateMore` and `validateChatMessages` accept good input and
      reject each bad field independently.
- [ ] Self-check test (`assert`): `validateGenerateMore` (count/optional elo) and
      `validateChatMessages` (roles, non-empty, last-is-user) accept + per-field
      reject. (DB/Groq/embedding paths exercised via curl.)
- [ ] No schema change; no student-facing change; Accept remains the only writer
      to `questions`.

---

## Sources

- Reused core — `backend/services/generation.service.js` (`getSeedQuestions`,
  `generateFromChunks`, `getTopicContext`), `backend/services/session.service.js`
  (`retrieveChunks`, `normalize`, `ok`/`fail`, `acceptQuestion`),
  `ai/groq.js` (`generateQuestions`), `ai/prompts/questionGenerator.js` (`SCHEMA`),
  `ai/gemini.js` (`embed`).
- Retrieval RPC + ephemeral chunks — `match_session_chunks`, `session_chunks`
  (spec 13, `db/schema.sql`).
- Accepted-question link (extra seeds) — `session_questions` (specs 13/14).
- Human review gate + Accept-as-only-writer + `normalize` dedup — spec 14.
- Model split (Groq generates, Gemini embeds) — spec 12 "Model roles", memory
  `model-split`.
- Admin gate + route/controller/service pattern —
  `backend/middleware/auth.middleware.js` (`requireAdmin`),
  `backend/routes/session.routes.js`, `backend/controllers/session.controller.js`.
- Workspace UI — `frontend/src/pages/GenerationWorkspace.tsx`,
  `frontend/src/lib/api.ts` (spec 14).
