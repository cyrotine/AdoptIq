# Spec 03 — Quiz Generation

**Feature Number:** 03
**Feature Title:** Quiz Generation
**Feature Slug:** quiz-generation
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** Spec 01 (schema live, 800 questions seeded), Spec 02 (auth working end-to-end)

---

## Overview

Connect the seeded Supabase question bank to the app: from the home page, an
authenticated student picks a subject and hits **Generate Test**. The backend
composes a 30-question quiz from the student's class + chosen subject, the
student takes it in the browser, submits, and sees a graded **result page with
explanations**. The quiz is persisted to `quiz_history` + `quiz_responses` and
the student's lifetime counters are updated.

Composition is **random within a fixed difficulty mix** for MVP — adaptive
composition driven by mastery/RL is Phase 4 and plugs into this same service
later by replacing only the selection step.

Seeded bank (verified live): 800 questions — every subject×class bucket can
serve the default mix (tightest bucket: Science has 9 Hard per class).

---

## User Story

As a **student**, I can generate a test for a subject I choose, answer its
questions, and immediately see my score with the correct answers and
explanations, so that I can practice and learn from my mistakes.

- Given I'm logged in, when I pick a subject and click Generate Test, then I
  get a 30-question quiz for my class.
- Given an active quiz, when I answer questions and submit, then I see my
  score, each question's correct answer, and its explanation.
- Given a completed quiz, then it appears in my quiz history data
  (`quiz_history` row + one `quiz_responses` row per question).

---

## Functional Requirements

1. **Subject picker** — list subjects from the DB (no hardcoding).
2. **Generate** — 30 questions for (student's class, chosen subject):
   - Difficulty mix: **12 Easy / 12 Medium / 6 Hard**.
   - If a difficulty bucket has too few questions, fill the shortfall from
     Medium, then Easy, then Hard (whatever has surplus). If the subject+class
     has fewer than 30 questions total, serve all of them; if it has zero,
     return a clear error.
   - Random selection, spread across all topics of the subject (no topic
     weighting in MVP).
   - The payload sent to the client **must not contain** `correct_answer` or
     `explanation`.
3. **Take** — the student answers A/B/C/D per question; time per question is
   tracked client-side; unanswered questions are allowed (count as wrong).
4. **Submit** — client sends `{subject, responses[]}`; the backend grades
   against `questions.correct_answer` (never trusts client grading), then in
   order:
   - insert `quiz_history` (actual difficulty counts served, correct count,
     total time, completed_on),
   - insert `quiz_responses` (one row per question: given answer or null,
     time_taken),
   - increment `students.total_quizzes` by 1 and `students.correct_answers`
     by the score.
5. **Result** — response returns score plus, per question: student's answer,
   correct answer, explanation (retrieved from `questions` — never stored in
   responses, per CLAUDE.md).
6. All endpoints require a valid JWT (Spec 02 middleware).

---

## Database Changes

**None.** Uses existing tables exactly as designed:
- reads: `subjects`, `chapters` (class filter), `topics`, `questions`
- writes: `quiz_history`, `quiz_responses`, `students` (the two lifetime counters)

Derivation rules honored: wrong answers, accuracy, and per-question
correctness are computed, never stored.

---

## Backend Changes

Extend the Spec 02 skeleton (`Route → Controller → Service → DB`):

```
backend/
  routes/subject.routes.js        # GET /            (list subjects)
  routes/quiz.routes.js           # POST /generate, POST /submit  (both behind requireAuth)
  controllers/subject.controller.js
  controllers/quiz.controller.js
  services/subject.service.js     # list subjects
  services/quiz.service.js        # composition + grading logic (ALL business logic here)
```

`server.js` mounts `/api/subjects` and `/api/quiz`.

### quiz.service.js — generate(studentId, subjectId)
1. Load student's `class` (from `students` by JWT id).
2. Fetch candidate questions for subject+class in one query:
   `questions` joined through `topics → chapters` filtered by
   `chapters.subject_id` and `chapters.class`
   (select id, text, options, difficulty_label, estimated_time — **not**
   correct_answer/explanation).
3. Bucket by difficulty, shuffle each bucket (Fisher–Yates), take 12/12/6 with
   the shortfall-fill rule; overall order shuffled.
4. Return `{subject, questions[], composition: {easy, medium, hard}}`.
   Stateless — nothing is written at generation time (abandoned quizzes leave
   no rows).

### quiz.service.js — submit(studentId, { subjectId, responses, totalTime })
1. Validate: responses is a non-empty array (≤ 50) of
   `{question_id, student_answer: A–D|null, time_taken ≥ 0}`; no duplicate
   question_ids.
2. Fetch those questions by id (with correct_answer, explanation,
   difficulty_label); reject ids that don't exist.
3. Grade server-side; compute score + per-difficulty served counts.
4. Insert `quiz_history` → get `quiz_id`; bulk-insert `quiz_responses`;
   update the student's two counters (read-increment-write).
5. Return result payload (below).

New dependencies: **none**.

---

## API Changes

All under auth (`Authorization: Bearer`). Error shape stays `{error}`.

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/subjects` | — | `200 {subjects: [{subject_id, subject_name}]}` |
| POST | `/api/quiz/generate` | `{subject_id}` | `200 {subject, composition, questions[]}` |
| POST | `/api/quiz/submit` | `{subject_id, total_time_taken, responses: [{question_id, student_answer, time_taken}]}` | `201 result` |

`questions[]` item (generate): `{question_id, question_text, option_a..d,
difficulty_label, estimated_time}` — no answers/explanations.

`result` (submit):
```json
{
  "quiz_id": "uuid",
  "score": 21, "total": 30,
  "composition": {"easy": 12, "medium": 12, "hard": 6},
  "total_time_taken": 1440,
  "results": [{
    "question_id": "uuid", "question_text": "...",
    "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
    "student_answer": "B", "correct_answer": "C", "is_correct": false,
    "explanation": "..."
  }]
}
```

Errors: 400 invalid body / unknown subject / no questions available,
401 unauth, 404 unknown question_id in submission.

---

## Frontend Changes

Extends the Spec 02 app (reuse `lib/api.ts`, `AuthContext`, `ProtectedRoute`):

```
frontend/src/
  pages/Home.tsx        # + subject picker (GET /api/subjects) + "Generate Test" button
  pages/Quiz.tsx        # take the quiz: one question at a time, A–D options,
                        #   progress (Q x/30), per-question timer, Submit at end
  pages/Result.tsx      # score summary + per-question review with explanations
  lib/quiz.ts           # types for generate/submit payloads
```

Routing: `/quiz` and `/result` added under `ProtectedRoute`. Quiz data flows
via router state (no persistence of an in-flight quiz — refresh abandons it;
acceptable for MVP, listed in Risks).

Every page: loading, error, and empty states (e.g. "no questions available
for this subject yet").

---

## AI Changes

None. (AI question generation is Phase 3; this feature reads the seeded bank.)

## RL Changes

None. Future hook: RL/mastery will replace the random-selection step inside
`quiz.service.generate` — the API contract and everything downstream stay
unchanged.

## Supabase Changes

None. Existing schema + seed; service_role access via existing `db/supabase.js`.

---

## Data Flow

```
Home: GET /api/subjects → picker → [Generate Test]
  → POST /api/quiz/generate {subject_id}
     service: student.class → questions⋈topics⋈chapters (subject, class)
              → bucket/shuffle/take 12-12-6 (+fallback) → strip answers
  ← {questions[]} → /quiz page (answer + per-question timing)
  → POST /api/quiz/submit {subject_id, responses[], total_time_taken}
     service: fetch questions by id → grade vs correct_answer
              → insert quiz_history → insert quiz_responses[]
              → students.total_quizzes += 1, correct_answers += score
  ← result {score, results[+explanations]} → /result page
```

---

## Risks

1. **Client-trust window.** Generation is stateless, so submit accepts any
   valid question ids — a student could replay known questions for a perfect
   score. Grading is still server-side. Acceptable for MVP; fix later by
   persisting the generated composition (needs a pending-quiz notion).
2. **Counter update isn't transactional.** quiz_history insert,
   quiz_responses insert, and student counter update are separate calls via
   PostgREST; a mid-sequence crash can skew `total_quizzes`. MVP accepts it;
   upgrade path is a single Postgres RPC (one function, one transaction).
3. **Refresh loses an in-flight quiz.** Quiz lives in router state only.
   Acceptable for MVP.
4. **Thin Hard bank for Science (9 per class).** Mix needs only 6, but repeat
   quizzes will recycle Hard questions heavily. Content problem, not code —
   note for seeding more Hard questions.
5. **Time values are client-reported** and unverifiable. Used for analytics
   only, never grading.

---

## Definition of Done

- [ ] `GET /api/subjects` returns the two seeded subjects (auth required).
- [ ] `POST /api/quiz/generate` returns 30 questions for the student's class +
      subject with a 12/12/6 mix (or documented fallback), **without**
      `correct_answer`/`explanation` anywhere in the payload.
- [ ] Two consecutive generates return different question orders/sets (randomness).
- [ ] `POST /api/quiz/submit` grades server-side; response matches the result
      contract; unanswered questions count wrong.
- [ ] `quiz_history` row has correct difficulty counts, score, time, subject;
      `quiz_responses` has one row per served question; student counters
      incremented correctly (verified in Supabase).
- [ ] Frontend: Home picker → Quiz page (progress, timing) → Result page with
      explanations; loading/error/empty states on all three.
- [ ] End-to-end in the browser: login → generate → answer → submit → review
      explanations; row visible in Supabase.
```
