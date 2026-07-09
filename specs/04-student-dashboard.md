# Spec 04 — Student Dashboard

Status: Draft (awaiting approval)
Branch: main
Phase: 1 (MVP) / early Phase 2 (Performance Tracking)

---

## Overview

The Student Dashboard is the landing page a student sees immediately after
login or registration. It replaces the current minimal `Home` page with a
visually appealing, responsive overview that:

1. Summarizes the student's overall performance (derived stats).
2. Lists their past quizzes, most recent first.
3. Lets them re-open any past quiz to review every question, their answer,
   the correct answer, and the explanation.
4. Keeps the existing "start a new quiz" entry point.

This is a **read + presentation** feature over data the platform already
stores. Per CLAUDE.md, it must not store anything derivable — every stat is
computed, never persisted. No new AI or RL behavior; it surfaces the data that
later Phase 2/4 analytics and RL will build on.

---

## User Story

> As a logged-in student, when I open AdaptIQ I land on a dashboard that shows
> how I'm doing overall and a list of my past quizzes, so I can start a new
> quiz or re-open a previous one and review the questions, correct answers,
> and explanations to learn from my mistakes.

---

## Functional Requirements

1. After login/register the student is routed to `/` (Dashboard).
2. The dashboard shows a **stats panel**:
   - Total quizzes taken.
   - Total correct answers.
   - Overall accuracy — **derived**, never stored.
3. The dashboard shows a **quiz history list** ordered by `completed_on`
   descending. Each row shows: subject, date completed, score
   (`correct_answers / total_questions`), per-quiz accuracy, difficulty mix
   (easy/medium/hard), and time taken.
4. Each history row has a **View** action opening a review of that quiz.
5. The **review view** renders every question of that quiz with the four
   options, the student's answer, the correct answer, and the explanation —
   reusing the same presentation as the post-submit Result page. Unanswered
   questions are shown as "Not answered".
6. Review is **authorization-scoped**: a student can only view quizzes where
   `quiz_history.student_id` matches their own id. Requesting another
   student's quiz returns 404.
7. The dashboard keeps the existing subject-selection → "Generate Test" flow.
8. Every view has explicit **loading**, **error**, and **empty** states
   (empty = "No quizzes yet — take your first quiz").

---

## Database Changes

**None.** All required data already exists:

- Overall counters: `students.total_quizzes`, `students.correct_answers`.
- Per-quiz summary: `quiz_history` (subject, easy/medium/hard_questions,
  correct_answers, total_time_taken, completed_on).
- Per-question detail: `quiz_responses` joined to `questions`.

`correct_answer` and `explanation` are read from `questions` at request time —
never copied into `quiz_responses` (CLAUDE.md rule). The existing
`quiz_history (student_id)` index already supports the history query.

---

## Backend Changes

Add two read endpoints to the existing quiz module (Route → Controller →
Service → DB). No business logic in routes.

### `quiz.service.js`

- `listHistory(studentId)` — select from `quiz_history` where
  `student_id = studentId`, ordered by `completed_on desc`. For each row
  compute `total_questions = easy + medium + hard_questions` and
  `accuracy = correct_answers / total_questions` (guard divide-by-zero).
  Return the raw summary fields plus the two derived fields.

- `getHistoryDetail(studentId, quizId)`:
  1. Fetch the `quiz_history` row by `quiz_id`. If missing **or**
     `student_id !== studentId` → `fail(404, 'quiz not found')` (same shape
     for both to avoid leaking existence).
  2. Fetch `quiz_responses` for that `quiz_id`.
  3. Fetch the referenced `questions` (question_text, options,
     `correct_answer`, `explanation`, `difficulty_label`).
  4. Assemble the **same `QuestionResult[]` / summary shape the submit
     endpoint already returns**, grading `is_correct` server-side, so the
     frontend can reuse the Result renderer unchanged.

### `quiz.controller.js`

- `history` and `historyDetail` handlers mirroring the existing
  `generate`/`submit` try/next pattern, passing `req.studentId` and
  `req.params.quizId`.

### `quiz.routes.js`

- `GET /history` → `requireAuth`, `controller.history`
- `GET /history/:quizId` → `requireAuth`, `controller.historyDetail`

No changes to `server.js`, auth middleware, or validation utils beyond a
`quizId` (UUID) format guard in the detail path.

---

## Frontend Changes

- **`pages/Dashboard.tsx`** (renames/replaces `Home.tsx`): stats panel +
  quiz-history list + existing subject-selection/generate flow. Reuses
  `useAuth()` for overall counters and `api()` for `/api/quiz/history`.
- **`pages/QuizReview.tsx`**: fetches `/api/quiz/history/:quizId` and renders
  the review. Extract the per-question review markup currently inline in
  `Result.tsx` into a small shared `QuestionReview` component and reuse it in
  both places — no duplicated rendering logic.
- **`App.tsx` routes** (inside `ProtectedRoute`): `/` → Dashboard,
  `/quiz/:quizId/review` → QuizReview. Keep `/quiz`, `/result`.
- **`lib/quiz.ts`**: add `HistoryItem` type and reuse the existing
  `SubmitResponse`/`QuestionResult` types for the detail response.
- Tailwind only; responsive (stat cards stack on mobile, history list is a
  single responsive column). Loading/error/empty states on every fetch.

---

## API Changes

New endpoints (JWT required, existing `{ error }` failure shape):

### `GET /api/quiz/history`

```json
{
  "history": [
    {
      "quiz_id": "uuid",
      "subject": "Maths",
      "completed_on": "2026-07-05T10:12:00Z",
      "easy_questions": 12,
      "medium_questions": 12,
      "hard_questions": 6,
      "total_questions": 30,
      "correct_answers": 21,
      "accuracy": 0.7,
      "total_time_taken": 842
    }
  ]
}
```

### `GET /api/quiz/history/:quizId`

Returns the **same shape as `POST /api/quiz/submit`** (`quiz_id`, `score`,
`total`, `composition`, `total_time_taken`, `results[]` with `question_text`,
options, `student_answer`, `correct_answer`, `is_correct`, `explanation`).
`404 { "error": "quiz not found" }` if the quiz doesn't exist or isn't owned
by the caller.

---

## AI Changes

None.

---

## RL Changes

None. This feature only reads history; it does not touch mastery or quiz
composition. It surfaces the data Phase 4 RL will later consume.

---

## Supabase Changes

None. No new tables, columns, indexes, or RLS policy changes — reads go
through the existing `service_role` server client. Ownership is enforced in
the service layer (`student_id` match), consistent with the current codebase.

---

## Data Flow

```
Login/Register  →  /  (Dashboard)
   │
   ├─ overall stats: students.total_quizzes, correct_answers
   │     accuracy = correct_answers / (total_quizzes × 30)   [derived]
   │
   ├─ GET /api/quiz/history
   │     quiz_history WHERE student_id=? ORDER BY completed_on DESC
   │        per row: total = easy+medium+hard, accuracy = correct/total
   │
   └─ View →  /quiz/:quizId/review
         GET /api/quiz/history/:quizId
            quiz_history (ownership check)
               → quiz_responses (student_answer, time_taken)
                  → questions (correct_answer, explanation)  [retrieved, not stored]
            → QuestionResult[] (graded server-side) → reuse Result renderer
```

---

## Risks

1. **Overall-accuracy denominator.** CLAUDE.md defines overall accuracy as
   `correct_answers / (total_quizzes × 30)`. If a quiz ever has fewer than 30
   questions (small question bank — `generate` can return < 30), the ×30
   denominator understates accuracy. Per-quiz accuracy uses the exact
   `easy+medium+hard` sum and is unaffected; only the headline overall number
   inherits this assumption. Flag for Phase 2 analytics.
2. **Ownership leak.** Detail endpoint must return an identical 404 for
   "not found" and "not yours" so quiz existence isn't leaked. Covered by the
   single `fail(404, 'quiz not found')` path.
3. **Divide-by-zero.** New student (0 quizzes) or a zero-question quiz →
   accuracy must render as 0 / "—", not `NaN`. Guard on both client and
   service.
4. **Renaming `Home.tsx`.** The `/quiz` flow reads router state; ensure the
   Dashboard still navigates to `/quiz` with `{ quiz, subjectId }` exactly as
   `Home` does today so quiz generation/submit is untouched.

---

## Definition of Done

- [ ] `GET /api/quiz/history` returns the caller's quizzes, newest first, with
      derived `total_questions` and `accuracy`.
- [ ] `GET /api/quiz/history/:quizId` returns the full graded review for an
      owned quiz and `404 { error }` for missing/unowned quizzes.
- [ ] `correct_answer`/`explanation` are read from `questions`, never stored in
      `quiz_responses`.
- [ ] Dashboard is the landing page after login and register, is responsive,
      and shows stats, history, and the start-quiz flow.
- [ ] Review view reuses the shared question-review component (no duplicated
      markup with Result).
- [ ] Loading, error, and empty states present on every fetch.
- [ ] Existing quiz generate/submit flow verified unchanged.
- [ ] No schema, AI, RL, or Supabase changes introduced.
