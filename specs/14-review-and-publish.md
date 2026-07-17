# Spec 14 — Review & Publish (accept-to-bank + Generation Workspace UI)

**Feature Number:** 14
**Feature Title:** Review & Publish
**Feature Slug:** review-and-publish
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 12-generation-core, 13-generation-session
**Unblocks:** 15-iterative-session (Generate More + Chat)

---

## Overview

Specs 12–13 generate candidate questions and return them to the admin's browser,
but nothing reaches students and there is no UI — the **Generate** button is
still a no-op. Spec 14 closes that gap and is **the first spec that delivers real
value**:

1. **Human review gate.** The admin reviews the transient candidates and, per
   card, **Accepts** or **Rejects**. Accept **publishes** the candidate into the
   permanent `questions` table (after backend validation + an exact-text
   duplicate check) and records a link row `(session_id, question_id)` in
   `session_questions`. Reject is **client-side only** — the card is dismissed and
   nothing is stored anywhere.
2. **Generation Workspace UI.** A new admin page ties the flow together: upload a
   document + pick target Elo + count (spec-13 create-session), review the
   returned candidates as cards, Accept/Reject each, and Finish the session. The
   **Generate** button opens this workspace for the chosen topic.

**Key property (the whole point of the earlier redesign):** a generated question
is stored **only if accepted**, and even then only its permanent row in
`questions` plus a reference in the link table — never a staging copy. Rejected
and unreviewed candidates touch **no table**.

Because candidates are **transient** (held in the browser, not the DB), **Accept
carries the full candidate content in the request body.** This makes accept a
genuine trust boundary: `validateGeneratedQuestion` runs again on the way in —
exactly CLAUDE.md's "never trust frontend validation, always validate again on
the backend." The AI Principle "the model never writes to the DB" still holds:
the admin's accept, through a service, is what writes.

**Scope — this spec does NOT build:**
- **Generate More** / **Chat** — spec 15. (Spec 15 reads `session_questions` to
  use this session's accepted questions as extra retrieval seeds.)
- **Editing** a candidate before accepting — accept-as-is or reject only.
- **Semantic** near-duplicate dedup — exact-text only (spec 12's scope).
- Any **schema change** — `questions` and the `session_questions` link table
  already exist (specs 01, 13).

---

## User Story

> As an AdaptIQ administrator, I want to open a topic that needs questions, upload
> its notes, and get AI candidates I can eyeball one by one — approving the good
> ones into the real question bank and discarding the rest — so only questions
> I've personally vetted reach students, and the discarded ones are never stored
> anywhere.

---

## Functional Requirements

1. **Accept a candidate (admin only).** `POST /api/admin/sessions/:id/accept`
   with the **full candidate** in the body (`question_text`, `option_a`–`d`,
   `correct_answer`, `explanation`, `elo_question`, `estimated_time`). Behind
   `requireAdmin`. Steps:
   - Session must exist and be `active`; else `404` / `409` (finished).
   - **Validate** the body with `validateGeneratedQuestion` → `400` on any bad
     field (this is the trust boundary — the content came from the client).
   - **Exact-text dedup:** if a question already exists on the session's topic
     with the same normalized `question_text`, do **not** insert → `409 { error:
     'duplicate' }`.
   - Otherwise **insert** a `questions` row — candidate fields + `topic_id` taken
     from the **session** (never the body) — then insert the link row
     `(session_id, question_id)` into `session_questions`. Return `201 { question }`.
   - The inserted `elo_question` is **frozen at creation** (spec 07).
2. **Reject is client-side only.** No endpoint, no request, no row. The workspace
   simply removes the card. (Rejected candidates were never stored to begin with.)
3. **`topic_id` is authoritative from the session**, never the request body — a
   candidate can't be published onto an unrelated topic even with a forged body.
4. **Generation Workspace page (admin only)** at `/admin/generate/:topicId`, gated
   by `AdminRoute`:
   - shows the target topic + an upload form (file `.pdf/.txt/.md`, `target_elo`
     0–100, `count` 1–20), and creates a session via spec-13 `POST
     /api/admin/sessions` (multipart);
   - renders the returned candidates as review cards (question, four options with
     the correct one marked, explanation, proposed Elo), each with **Accept** and
     **Reject**;
   - Accept → calls the endpoint, marks the card published (or shows *duplicate*
     on `409`); Reject → removes the card locally;
   - **Finish** (spec-13 `POST /:id/finish`) closes the session;
   - explicit loading / error / empty states.
5. **Wire the Generate button.** In `AdminPanel`, the per-topic **Generate**
   button navigates to `/admin/generate/:topicId` (carrying the topic name). No
   longer a no-op.
6. **No student-facing change** beyond the natural one: accepted questions become
   eligible in the existing quiz generation — no `quiz.service` change.

---

## How accept publishes (the only write to `questions`)

```
POST /api/admin/sessions/:id/accept   (body = full candidate)   [requireAdmin]
  -> session.service.acceptQuestion(sessionId, candidate):
       load session (must exist & be 'active')                  -> 404 / 409
       validateGeneratedQuestion(candidate)                     -> 400 on bad field
       normalize(question_text); exact-match vs questions on session.topic_id
         duplicate? -> 409 { error: 'duplicate' }   (no insert)
       insert questions { ...candidate, topic_id: session.topic_id }   -> question_id
       insert session_questions { session_id, question_id }     (accepted link)
       return 201 { question }
```

- **Normalization** for dedup: trim, lowercase, collapse internal whitespace —
  the "exact repeat" notion from spec 12 Risk #3. Paraphrases are out of scope.
- **Validation is required here** (unlike a staging-table design): the candidate
  content arrives from the client, so `validateGeneratedQuestion` is a real trust
  boundary, backed by the `questions` CHECK constraints.
- The link row is what lets spec 15's **Generate More** use this session's
  accepted questions as additional retrieval seeds.

---

## Database Changes

**None.** `questions` (spec 01) receives the insert; the `session_questions`
link table `(session_id, question_id)` already exists (spec 13). No new table,
column, or function.

---

## Backend Changes

- **`backend/services/session.service.js`** (edit) — add:
  - `acceptQuestion(sessionId, candidate)` — the only new writer: load+guard the
    session, `validateGeneratedQuestion`, exact-text dedup on the session's topic,
    insert `questions`, insert the `session_questions` link, return `{ status,
    body }`.
  - a small local `normalize(text)` for dedup.
  - (No `rejectQuestion` — reject is client-side only.)
- **`backend/controllers/session.controller.js`** (edit) — add `accept` (parse
  body → service → send), mirroring existing controllers.
- **`backend/routes/session.routes.js`** (edit) — add `POST /:id/accept` behind
  `requireAdmin`. (No reject route.)
- **`backend/utils/validate.js`** — reuse `validateGeneratedQuestion` (spec 12).
  No new validator.
- No new dependency.

## Frontend Changes

- **`frontend/src/lib/api.ts`** — add `apiUpload<T>(path, formData)` (sends
  `FormData` with the Bearer token and **no** `Content-Type`, so the browser sets
  the multipart boundary — the JSON `api()` can't do multipart). Add typed helpers
  `createSession`, `acceptCandidate`, `finishSession`, and `Candidate` /
  `GenerationSession` interfaces.
- **`frontend/src/pages/GenerationWorkspace.tsx`** (new) — FR4: upload form →
  create session → candidate cards with Accept/Reject → Finish. Candidates live in
  React state; Reject just filters one out; loading / error / empty states.
- **`frontend/src/pages/AdminPanel.tsx`** (edit) — the **Generate** button now
  `navigate(\`/admin/generate/${t.topic_id}\`, { state: { topicName: t.topic_name } })`.
- **`frontend/src/App.tsx`** (edit) — add inside `AdminRoute`:
  `<Route path="/admin/generate/:topicId" element={<GenerationWorkspace />} />`.

## API Changes

- **`POST /api/admin/sessions/:id/accept`** — `requireAdmin`, body = full
  candidate. → `201 { question }`; `400` invalid field; `409 { error: 'duplicate' }`
  if the text already exists on the topic; `409` if the session is finished;
  `404` unknown session; `401` no admin token.
- **Reject:** no endpoint (client-side dismiss).
- Reuses spec-13 `POST /api/admin/sessions`, `GET /:id`, `POST /:id/finish`.
- No student-facing route changes.

## AI Changes

None new. Spec 14 reviews and publishes what spec 12/13 generated. The model
never writes to the DB — accept is a validated, service-side insert triggered by
the admin.

## RL Changes

None.

## Supabase Changes

**None.** Accept writes to the existing `questions` + `session_questions` via the
service role.

## Data Flow

```
(admin panel) Generate -> navigate /admin/generate/:topicId

(workspace)
upload submit -> apiUpload POST /api/admin/sessions (file, topic_id, target_elo, count)   [spec 13]
             -> candidates in React state

per candidate:
  Accept -> POST /api/admin/sessions/:id/accept (candidate body)
              validate -> dedup on topic -> insert questions -> insert link row
           -> card: Published | Duplicate(409)
  Reject -> remove card locally   (no request, no row)

Finish -> POST /api/admin/sessions/:id/finish   [spec 13]

(student, later, unchanged) quiz.service.generate() -> accepted questions are eligible
```

---

## Risks

1. **Publishing is effectively irreversible in v1.** Accept inserts a permanent
   `questions` row; no un-publish UI (manual DB delete). Fine for a careful single
   admin.
2. **Candidates lost on reload.** They live only in the browser; reloading the
   workspace mid-review loses the un-accepted ones — regenerate. Deliberate: only
   accepted questions are stored (spec 13 Risk #2).
3. **Exact-text dedup only.** Paraphrases pass; semantic dedup (reading spec 13's
   embeddings) is a later add.
4. **Human review is the truth gate — and fallible.** A rushed admin can approve a
   subtly wrong answer. Keep batches small enough to actually read.
5. **Multipart from the browser.** Accept is JSON, but create-session is
   multipart; `apiUpload` must omit `Content-Type`. The likely first bug — called
   out.
6. **Client-supplied candidate content.** Accept trusts nothing: it re-validates
   the body and takes `topic_id` from the session, so a forged/edited body can't
   inject a malformed question or cross topics. The `questions` CHECK constraints
   backstop it.

---

## Definition of Done

- [ ] `POST /:id/accept` validates the body, inserts a `questions` row (topic from
      the session, Elo frozen) and a `session_questions` link row, and returns
      `201 { question }`; a subsequent `quiz.service.generate()` on that topic can
      surface it.
- [ ] Accepting a candidate whose normalized text already exists on the topic →
      `409 { error: 'duplicate' }`, no `questions` write, no link row.
- [ ] Accepting an invalid body → `400`; accepting on a finished session → `409`;
      unknown session → `404`; no admin token → `401`.
- [ ] Reject writes nothing and hits no endpoint — the card is removed
      client-side.
- [ ] The Generate button opens `/admin/generate/:topicId`; the workspace uploads
      a file, shows candidates, Accept publishes / Reject dismisses, Finish closes
      — with loading / error / empty states.
- [ ] `apiUpload` sends `FormData` with the Bearer token and no forced
      `Content-Type`; create-session succeeds from the UI.
- [ ] Self-check test (`assert`): the `normalize()` dedup helper treats
      case/whitespace-different texts as equal and genuinely different ones as
      distinct.
- [ ] No schema change; no student-facing page/route changed; accept is the only
      new writer to `questions`.

---

## Sources

- Spec 13 session service/routes/controller (extended) —
  `backend/services/session.service.js`, `backend/routes/session.routes.js`,
  `backend/controllers/session.controller.js`.
- `questions` columns + CHECK constraints; `session_questions` link table —
  `db/schema.sql`, specs 01 & 13.
- `validateGeneratedQuestion`; exact-text dedup framing — spec 12.
- Frozen-Elo-at-creation — spec 07.
- Admin gate — `backend/middleware/auth.middleware.js` (`requireAdmin`).
- Frontend admin patterns — `frontend/src/pages/AdminPanel.tsx`,
  `frontend/src/components/AdminRoute.tsx`, `frontend/src/lib/api.ts` (the JSON
  `api()` that `apiUpload` complements), `frontend/src/App.tsx`.
