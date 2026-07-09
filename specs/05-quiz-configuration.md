# Spec 05 — Quiz Configuration

**Feature Number:** 05
**Feature Title:** Quiz Configuration
**Feature Slug:** quiz-configuration
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** Spec 03 (quiz generate/submit live), Spec 04 (dashboard)

---

## Overview

Today "Generate Test" ships a fixed 30-question quiz (12 Easy / 12 Medium / 6
Hard) drawn from the whole subject. This feature lets the student **shape the
quiz before generating it**:

1. **Chapter multi-select** — after picking a subject, the student sees every
   chapter for their class in that subject and ticks the ones to include.
   Questions are drawn only from ticked chapters.
2. **Fixed 30-question total** — unchanged; the quiz is always 30 questions.
3. **Difficulty distribution control** — a horizontal control below the chapter
   list lets the student set how many of the 30 are Easy / Medium / Hard. The
   three counts always sum to 30.

This is a **configuration layer over the existing Spec 03 generate pipeline**.
The composition step already buckets by difficulty and fills shortfalls — we
replace the hardcoded mix + subject-wide candidate query with client-supplied
values, and reuse everything else (grading, submit, result, history unchanged).

---

## User Story

As a **student**, I can choose which chapters my test covers and how many easy,
medium, and hard questions it contains, so that I can target the material and
difficulty I want to practice.

- Given I picked a subject, when I open Generate Test, then I see all chapters
  for my class in that subject as tickable items.
- Given I tick one or more chapters and set a difficulty split summing to 30,
  when I click Generate, then I get a 30-question quiz drawn only from those
  chapters with (approximately) that difficulty mix.
- Given I tick no chapters, then Generate is disabled (I must pick at least one).
- Given I set a split that doesn't sum to 30, then Generate is disabled with a
  clear hint.

---

## Functional Requirements

1. **Chapter list** — list chapters for (student's class, chosen subject) from
   the DB. No hardcoding. Show a loading/empty state ("no chapters for this
   subject yet").
2. **Selection** — multi-select via checkboxes. At least one chapter required.
   Default: all chapters ticked.
3. **Difficulty split** — three linked number controls (easy/medium/hard) on a
   horizontal row below the chapter list. Constraint: `easy + medium + hard === 30`.
   Default `12 / 12 / 6` (matches current behavior). Each count `0–30`.
4. **Even chapter distribution** — the 30 questions are spread as evenly as
   possible across the selected chapters, not lumped into one. With N chapters
   the target is ~`30/N` each (e.g. 2 chapters → ~15/15, not 25/5); remainder
   distributed one-per-chapter. A chapter that can't supply its share (too few
   questions) gives what it has, and the shortfall is redistributed to chapters
   that still have surplus. Chapter balance is **best-effort within the
   difficulty split** — the difficulty mix (req. 3) takes priority, and exact
   simultaneous satisfaction of both isn't always possible when a chapter lacks
   questions of a given difficulty.
5. **Generate** — POST the subject, selected `chapter_ids`, and the split. The
   backend:
   - fetches candidate questions restricted to the selected chapters (still
     filtered by student class + subject as a guard),
   - buckets by difficulty, then within each difficulty bucket picks
     **round-robin across chapters** (shuffled within each chapter) so no
     chapter dominates, takes the requested easy/medium/hard counts, and
     **fills any shortfall from other buckets** (existing rule) so the quiz is
     still 30 when a bucket is thin,
   - never returns `correct_answer`/`explanation` (unchanged).
6. **Server is authoritative** — backend re-validates the split sums to 30 and
   that every `chapter_id` belongs to the student's class + chosen subject.
   Frontend validation is not trusted (CLAUDE.md).
7. Submit / result / history flows are **unchanged** — `composition` in the
   result reflects what was actually served (already computed server-side).

---

## Database Changes

**None.** Reads existing `chapters` (already has `chapter_name`, `class`,
`subject_id`) and filters `questions` through `topics → chapters` by
`chapter_id`. No new columns; the served difficulty counts continue to be
stored in `quiz_history` exactly as today (not derived → allowed).

---

## Backend Changes

Extend the Spec 03 modules; no new files.

```
backend/
  routes/subject.routes.js      # + GET /:subject_id/chapters   (behind requireAuth)
  controllers/subject.controller.js  # + listChapters
  services/subject.service.js   # + listChapters(studentId, subjectId)
  services/quiz.service.js      # generate() takes chapter_ids + difficulty split
  utils/validate.js             # validateGenerate() extended
```

### subject.service.js — listChapters(studentId, subjectId)
- Load student's `class`.
- `SELECT chapter_id, chapter_name FROM chapters WHERE subject_id = ? AND class = ? ORDER BY chapter_id`.
- Return `{ chapters: [{chapter_id, chapter_name}] }`.

### quiz.service.js — generate(studentId, input)
Input becomes `{ subject_id, chapter_ids: number[], easy, medium, hard }`.
- Validate (below). Reject if split ≠ 30.
- Verify chapter ownership: fetch chapters for (subject, class); every
  requested `chapter_id` must be in that set → else `400 invalid chapter`.
- Candidate query gains `.in('topics.chapters.chapter_id', chapter_ids)` and
  selects each question's `chapter_id` (via the topics→chapters join) so picks
  can be balanced per chapter.
- `MIX` is no longer a constant — build it from the request:
  `[['Easy', easy], ['Medium', medium], ['Hard', hard]]`. `QUIZ_SIZE` stays 30.
- **Even chapter spread** — within each difficulty bucket, group candidates by
  `chapter_id`, shuffle each group, then take round-robin across chapters until
  the bucket's target count is met (a chapter's group empties → skip it; its
  share falls to the others). This replaces the current "shuffle the whole
  bucket then splice N" with a round-robin take. Shortfall-fill (`FILL_ORDER`)
  across difficulties is **reused as-is** and also takes round-robin.
- A single helper (`takeRoundRobin(bucket, chapterIds, n)`) keeps the logic in
  one place; the outer take/fill structure is otherwise unchanged.

### validate.js — validateGenerate
Extend to require:
- `chapter_ids`: non-empty array (≤ 50) of positive integers, no duplicates.
- `easy`, `medium`, `hard`: integers `0–30`, summing to exactly 30.

Keeps returning an error string or null (existing contract). `validateSubmit`
unchanged.

New dependencies: **none**.

---

## API Changes

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/subjects/:subject_id/chapters` | — | `200 {chapters: [{chapter_id, chapter_name}]}` |
| POST | `/api/quiz/generate` | `{subject_id, chapter_ids, easy, medium, hard}` | `200 {subject, composition, questions[]}` |

`/api/quiz/generate` **body changes** (breaking vs Spec 03): `chapter_ids` and
the three counts are now required. Response shape is unchanged. `composition`
in the response still reports the actually-served counts (may differ from the
requested split when a bucket was filled from another).

Errors: `400` — split ≠ 30, empty/invalid `chapter_ids`, chapter not in
subject/class, unknown subject, no questions available for the selection;
`401` unauth.

---

## Frontend Changes

```
frontend/src/
  pages/Dashboard.tsx   # after subject select: fetch + render chapter checklist,
                        #   difficulty split row, updated generate() payload
  lib/quiz.ts           # + Chapter type; extend generate request type
```

- On subject select → `GET /api/subjects/:id/chapters`; render a checklist
  (all ticked by default). Loading / empty / error states.
- **Difficulty split row** (horizontal, below the checklist): three labeled
  number inputs Easy / Medium / Hard, showing a live total and a hint when it
  isn't 30. Implement with native `<input type="number">` in a horizontal flex
  row — a real slider widget isn't needed for three integers that must sum to
  30; the constraint is numeric, not continuous.
  <!-- ponytail: native number inputs, not a drag-slider lib. Add a slider only
       if product wants continuous drag; the sum-to-30 rule is easier to enforce
       with numbers anyway. -->
- Generate button disabled unless: ≥1 chapter ticked **and** split sums to 30.
- `generate()` posts `{subject_id, chapter_ids, easy, medium, hard}`.

Downstream Quiz/Result/Review pages need no changes.

## AI Changes
None.

## RL Changes
None. Future: RL can pre-fill the default split and chapter emphasis from
mastery; the contract here (client sends chapters + split) already accommodates
a system-suggested default.

## Supabase Changes
None. Existing schema + seed; service_role access via existing `db/supabase.js`.

---

## Data Flow

```
Dashboard: pick subject
  → GET /api/subjects/:id/chapters  (class-filtered)  → checklist (all ticked)
  → set Easy/Medium/Hard split (must total 30)
  → [Generate Test]
  → POST /api/quiz/generate {subject_id, chapter_ids, easy, medium, hard}
     service: validate split=30 + chapters ⊆ (subject,class)
              → questions ⋈ topics ⋈ chapters filtered by chapter_ids
              → bucket/shuffle/take (easy,medium,hard) + shortfall-fill → strip answers
  ← {questions[], composition} → /quiz  (submit/result unchanged)
```

---

## Risks

1. **Thin selection.** Ticking one small chapter with a Hard-heavy split may
   have fewer than 30 questions; the shortfall-fill already degrades gracefully
   (fills from other difficulties, then serves fewer than 30 only if the whole
   selection has <30). Frontend shows the served `composition`, which may differ
   from the request. Acceptable — same fallback contract as Spec 03.
2. **Breaking generate contract.** Existing clients calling `/generate` with
   only `subject_id` now 400. Only our own frontend calls it; updated in the
   same change. No external consumers.
3. **Chapter-ownership check is an extra query** per generate. Cheap; guards
   against a client requesting another class's chapters.
4. **Balance vs. difficulty conflict.** Even chapter spread and the exact
   difficulty split can't always both hold (a chapter may have no Hard
   questions). Difficulty split wins; chapter balance is best-effort. Documented
   in req. 4 — not a bug.

---

## Definition of Done

- [ ] `GET /api/subjects/:subject_id/chapters` returns class-filtered chapters
      for the subject (auth required); empty array handled in UI.
- [ ] `POST /api/quiz/generate` requires `chapter_ids` + `easy/medium/hard`,
      rejects splits ≠ 30 and chapters outside the student's class/subject.
- [ ] Generated quiz draws only from selected chapters, honors the requested
      mix (with documented shortfall-fill), stays ≤30, no answers in payload.
- [ ] Questions are spread ~evenly across selected chapters (2 chapters → close
      to 15/15, not 25/5), subject to chapter availability.
- [ ] Dashboard: subject → chapter checklist (default all ticked) → horizontal
      Easy/Medium/Hard row with live total; Generate disabled until ≥1 chapter
      and total = 30; loading/error/empty states present.
- [ ] End-to-end in the browser: pick subject → tick chapters → set split →
      generate → take → submit → result; `quiz_history` difficulty counts match
      what was served.
