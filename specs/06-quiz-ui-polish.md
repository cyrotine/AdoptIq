# Spec 06 — Quiz & Review UI Polish

**Feature Number:** 06
**Feature Title:** Quiz & Review UI Polish
**Feature Slug:** quiz-ui-polish
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** Spec 03 (quiz take/submit/review), Spec 05 (chapter-based generation)

---

## Overview

Cosmetic + context upgrade to the question UI. Three changes:

1. **Show each question's topic and its chapter** on the take-quiz card and in
   the review cards (e.g. `Chemical Reactions · Types of Reactions`). Students
   currently see a question with no idea which chapter/topic it tests.
2. **Color-code the difficulty badge** — green Easy / yellow Medium / red Hard
   (today it's a flat grey pill).
3. **Color-code answer state in review** — a per-question status pill with three
   states: **green Correct**, **red Incorrect**, **grey Unanswered**, plus a
   matching left-accent on each review card so state is scannable at a glance.

No new behavior, no schema change. The only backend work is **exposing data
that already exists via joins** — topic name, chapter name, and (in review)
difficulty — none of which are answer/explanation secrets.

---

## User Story

As a **student**, I can see which chapter and topic each question belongs to and
tell at a glance how hard it is and (in review) whether I got it right, so that
I understand what I'm practicing and can find my weak areas faster.

- Given an active quiz, when I view a question, then I see its topic and chapter
  and a color-coded difficulty badge (green/yellow/red).
- Given a completed quiz's review, when I scan the list, then each question shows
  a green/red/grey status (correct/incorrect/unanswered) and its topic + chapter.

---

## Functional Requirements

1. **Topic + chapter label** on every question, both on the take-quiz card
   (`Quiz.tsx`) and each review card (`QuestionReview.tsx`). Format:
   `{chapter_name} · {topic_name}`. Small, muted, above the question text.
2. **Difficulty badge colors** — a single shared helper maps
   `Easy→green`, `Medium→yellow/amber`, `Hard→red` (badge bg + text). Used on
   the quiz card and (new) on each review card. Accessible: color + the label
   text ("Easy"), never color alone.
3. **Answer-state pill (review)** — three states:
   - `Correct` → green (student_answer set and correct)
   - `Incorrect` → red (student_answer set and wrong)
   - `Unanswered` → grey (student_answer is null)
   Plus a left border/accent on the card in the same color. The option coloring
   inside the card (correct option green, chosen-wrong option red) stays as-is.
4. All three states must be derivable from existing `QuestionResult` fields
   (`student_answer`, `is_correct`) — no new grading logic.
5. Loading/error/empty states on the affected pages are unchanged (still present).

---

## Database Changes

**None.** `topic_name` (from `topics`) and `chapter_name` (from `chapters`) are
retrieved via join, never stored on questions/responses — honors CLAUDE.md
("retrieve, don't duplicate"). Difficulty already lives on `questions`.

---

## Backend Changes

Expose already-joined fields; no new endpoints, no new logic.

`backend/services/quiz.service.js`:
- **`generate`** — candidate query already joins `topics`; extend the nested
  select to `topics!inner(topic_name, chapter_id, chapters!inner(chapter_name))`.
  Attach `topic_name` + `chapter_name` to each returned question (alongside the
  existing fields). `chapter_id` stays internal/stripped as today; `topic_name`
  and `chapter_name` are now included in the client payload. Still **no**
  `correct_answer`/`explanation`.
- **`submit`** — the per-question fetch (`questions … in ids`) gains
  `difficulty_label` (already selected) **plus** `topics(topic_name,
  chapters(chapter_name))`. Include `difficulty_label`, `topic_name`,
  `chapter_name` in each `results[]` item. (Today `difficulty_label` is
  destructured out — keep it in the payload now.)
- **`getHistoryDetail`** — its questions fetch currently selects no difficulty
  or topic; add `difficulty_label` and the `topics/chapters` join, and include
  the same three fields per result so historical review matches fresh review.

No new dependencies.

---

## API Changes

No new routes. **Additive** response fields (backward compatible):

- `POST /api/quiz/generate` → each `questions[]` item gains
  `topic_name: string`, `chapter_name: string`.
- `POST /api/quiz/submit` and `GET /api/quiz/history/:quizId` → each `results[]`
  item gains `difficulty_label: 'Easy'|'Medium'|'Hard'`, `topic_name`,
  `chapter_name`.

Still absent from generate payload: `correct_answer`, `explanation`, `chapter_id`.

---

## Frontend Changes

```
frontend/src/
  lib/quiz.ts                    # + topic_name/chapter_name on QuizQuestion;
                                 #   + difficulty_label/topic_name/chapter_name on QuestionResult
  components/DifficultyBadge.tsx # NEW: <DifficultyBadge label=… /> color map (green/yellow/red)
  pages/Quiz.tsx                 # topic·chapter line; use DifficultyBadge
  components/QuestionReview.tsx  # topic·chapter line; DifficultyBadge; 3-state status pill + card accent
```

- **`DifficultyBadge`** — one reusable component; single source of truth for the
  Easy/Medium/Hard color map so quiz and review never drift. (Reuse over copying
  Tailwind classes in two files.)
- **Status pill / accent** in `QuestionReview` — derive state from
  `student_answer === null` → Unanswered (grey); else `is_correct` → Correct
  (green) / Incorrect (red). Left-accent via a colored `border-l-4`.
- Topic·chapter line uses the new fields; muted `text-xs text-gray-500`.

No routing changes. All existing loading/error/empty states preserved.

## AI Changes
None.

## RL Changes
None. (Topic/chapter surfaced here is also the natural anchor for future
per-topic mastery display — no work now.)

## Supabase Changes
None. Existing schema + joins via `db/supabase.js`.

---

## Data Flow

```
generate: questions ⋈ topics(topic_name) ⋈ chapters(chapter_name)
          → payload questions[] now carry topic_name + chapter_name
          → Quiz.tsx renders "chapter · topic" + colored DifficultyBadge

submit / history detail: questions ⋈ topics ⋈ chapters (+ difficulty_label)
          → results[] carry difficulty_label + topic_name + chapter_name
          → QuestionReview renders "chapter · topic", DifficultyBadge,
            and green/red/grey status pill + accent
```

---

## Risks

1. **Payload size** grows slightly (two short strings per question). Negligible.
2. **Join adds columns, not rows** — `!inner` on topics/chapters could drop a
   question whose topic/chapter row is missing. Data is seeded with valid FKs,
   so no real loss; if a question ever lacked a topic it would already be absent
   from generation today. No behavior change.
3. **Color accessibility** — green/yellow/red must not be the only signal; the
   label/status text always accompanies the color (req. 2 & 3).

---

## Definition of Done

- [ ] Generate payload includes `topic_name` + `chapter_name` per question;
      still no `correct_answer`/`explanation`/`chapter_id`.
- [ ] Submit + history-detail results include `difficulty_label`, `topic_name`,
      `chapter_name`.
- [ ] Quiz card shows "chapter · topic" and a difficulty badge colored green
      (Easy) / yellow (Medium) / red (Hard).
- [ ] Review cards show "chapter · topic", the same colored difficulty badge,
      and a green/red/grey status pill (Correct/Incorrect/Unanswered) with a
      matching left accent.
- [ ] `DifficultyBadge` is a single shared component used by both quiz and review.
- [ ] End-to-end in the browser: generate → take (see topic/chapter + color) →
      submit → review (three states colored) → open a past quiz from history and
      see the same.
