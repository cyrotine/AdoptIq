# Spec 09 — Adaptive Elo Engine (Personalization Signals)

**Feature Number:** 09
**Feature Title:** Adaptive Elo Engine
**Feature Slug:** adaptive-elo-engine
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 01-database-schema, 03-quiz-generation, 07-question-difficulty-cleanup, 08-student-elo-baseline

---

## Overview

Spec 08 created `student_topic_mastery.elo` and seeded it from an onboarding
probe, but explicitly deferred the **per-quiz Elo update** ("Phase-4 Elo engine")
to a later feature. This spec is that engine.

Beyond the two obvious signals — **correctness** and **time taken** — the update
is personalized with a small set of research-backed signals about what actually
happens in a student's head during a quiz: whether they were engaged or
rapid-guessing, whether they slipped vs. genuinely didn't know, and how fatigued
they were by the end. All signals are **inferred passively from behavior already
on the page** (timing, answer switches, position) — nothing is asked of the
student mid-quiz. An earlier draft of this spec included a self-reported
confidence tap per question; it's cut (see Risk 1) because interrupting the quiz
to ask "how sure are you?" adds friction and time pressure — exactly the kind of
extra cognitive load and anxiety this feature is trying to read around, not add.

The engine runs inside the existing `POST /api/quiz/submit` path (which already
grades every answer server-side and holds each question's Elo and time), reads
the current per-topic Elo, and upserts `student_topic_mastery` in place. Per the
approved design, only the **current** Elo is kept — no Elo-history table.

---

## User Story

> As a student, after each quiz my per-topic level should move in a way that
> reflects how I actually performed — not just whether I got questions right, but
> whether I was guessing, whether I slipped on an easy question, and how the
> question compared to my level — so my next quizzes are pitched at the right
> difficulty, without the quiz itself asking me extra questions.

---

## Research basis (what affects a student during a quiz)

1. **Test-taking effort — rapid guessing vs. idling.** Response time reveals
   engagement; disengaged responses (too fast / too slow) should be discounted,
   not read as (in)ability. (Response Time Effort; rapid-guessing detection —
   see "How do we detect guessing?" below.)
2. **Slip vs. guess.** A wrong answer despite skill (slip / carelessness) and a
   right answer without skill (lucky guess) should each move Elo *less* than a
   genuine result. (Bayesian Knowledge Tracing slip/guess parameters.)
3. **Answer revisions.** How often the student changed their selection before
   submitting is a passive uncertainty signal — no prompt needed, it's just
   counting clicks already happening in the UI.
4. **Cognitive fatigue & question position.** Accuracy declines through a
   session; late-quiz errors are weaker evidence of low skill.
5. **Forgetting & spacing (Ebbinghaus).** A stale topic Elo should be trusted less
   and allowed to move faster on the next attempt.
6. **Dynamic K-factor.** New / rarely-attempted topics move fast; established ones
   stay stable.

Sources listed at the bottom.

---

## How do we detect guessing? (no self-report needed)

The core idea, from the response-time-effort literature (Wise & Kong; rapid-guessing
detection in low-stakes assessment), is: **you can't observe knowledge directly,
but you can observe behavior, and guessing behavior has a distinct time signature.**
A student who is genuinely engaging with a question reads it, thinks, and answers
in a time roughly proportional to its difficulty. A student who is guessing —
blindly clicking an option to move on — answers implausibly fast, faster than
reading comprehension alone would allow, regardless of whether they happen to get
it right.

Concretely, for each response we compare `time_taken` against a **threshold**
derived from `questions.estimated_time` (already stored per question):

- **Rapid-guess threshold:** `time_taken < 0.15 × estimated_time` (roughly — a
  15-second question answered in 2 seconds is not being read, let alone reasoned
  about). This "normative threshold" method (a fixed fraction of expected/typical
  time) is the simplest version used in the literature; more advanced variants fit
  the threshold per-question from the observed response-time distribution instead
  of a flat percentage, but a flat threshold is a reasonable, auditable MVP.
- **Idling threshold:** `time_taken > 4× estimated_time` (or some multiple) flags
  the opposite failure mode — the student got distracted, left the tab, or froze —
  which is also not good evidence of ability either way.

Anything in between is treated as a genuine, engaged attempt.

**Why this doesn't need a self-report:** the signal isn't "was this a guess" as a
binary fact about the student's mental state — it's "how much should this response
count as evidence," and elapsed time is a strong, free, always-available proxy for
that. It can misfire (a fast, genuinely confident correct answer from a strong
student on an easy item looks similar to a lucky fast guess) — which is exactly
why it's used as a **dampener on the Elo update's magnitude**, not a hard
include/exclude filter:

```
effort_weight =
  0.15                                  if time_taken < 0.15 × estimated_time   (rapid guess)
  0.4                                   if time_taken > 4 × estimated_time      (idling)
  1.0                                   otherwise                              (engaged)
```

A rapid-guess response still updates Elo — just barely (weight 0.15, not 0) —
because a rare student really is just fast. This mirrors how the literature treats
rapid-guessing: as a strong but imperfect signal, so it should *shrink* the
response's influence, not delete it. This also composes with the **slip guard**
below, which independently catches the "strong student, easy question, wrong
answer" case that a pure time threshold would miss (a slip can happen at a normal
answering pace).

Two refinements possible later, if the flat 15%/4× thresholds prove too
coarse once real data exists:
- **Per-question threshold** — since `estimated_time` already varies per
  question, thresholds are already question-relative, not global; the improvement
  would be deriving the threshold from the *actual* observed time distribution for
  that question (e.g. bottom 5th percentile of past response times) rather than a
  fixed fraction.
- **Per-student baseline** — compare a response's time against that student's own
  typical pace on similar-difficulty questions, catching guessing for naturally
  fast readers who'd otherwise trip the global threshold on legitimate answers.

---

## Functional Requirements

1. On `submit`, for every graded response the engine computes a new per-topic Elo
   and upserts `student_topic_mastery` (`elo`, `attempts + 1`, `updated_on = now()`),
   clamped 0–100. Multiple responses on the same topic in one quiz accumulate.
2. Signal inputs per response: correctness, question Elo (`elo_question`),
   `time_taken` vs `estimated_time`, `answer_changes`, `position`, plus the
   topic's current `elo` / `attempts` / `updated_on`.
3. **Effort gate:** responses classified as rapid-guessing or idling (time-based,
   see above) contribute proportionally less to the Elo update — never asked of
   the student, always derived from `time_taken`.
4. **Slip guard, fatigue discount, churn dampening** are applied as bounded
   multiplicative modifiers on the update magnitude — no single signal can
   dominate.
5. **Dynamic K-factor** decays with the topic's `attempts`.
6. Both new `quiz_responses` signals are **optional**: missing values (e.g. from
   pre-spec-09 rows) fall back to neutral weights, so the engine degrades
   gracefully.
7. Client grading is never trusted; the engine only uses server-graded correctness
   (unchanged from spec 03).
8. **No mid-quiz prompts.** Every signal the engine consumes must be derivable
   from behavior the student was already going to produce (timing, clicks,
   ordering) — never an extra question inserted into the quiz flow.

---

## Database Changes

Two new columns on **`quiz_responses`** (canonical form in `db/schema.sql`;
migration in `db/update.sql`, spec-09 section — both already written):

```sql
alter table quiz_responses
  add column if not exists answer_changes smallint not null default 0,
  add column if not exists position       smallint;  -- 1-based ordinal in the quiz
```

Design notes (honours "don't store derivable data"):
- **`answer_changes`** — only the final answer is stored today, so revision count
  is new information; it's a passive count of clicks already happening, not a
  question asked of the student.
- **`position`** — `quiz_responses`' PK `(quiz_id, question_id)` is unordered, so
  in-quiz position (and thus fatigue) is otherwise unrecoverable.
- **No new columns** on `student_topic_mastery` — `elo`, `attempts`, `updated_on`
  already carry the state the engine writes, and `updated_on` doubles as the
  last-practiced timestamp for the forgetting term.
- **No `confidence` column.** Considered and dropped — see Risk 1.

Optional Tier 2 (commented out in `update.sql`, not applied): `students.baseline_anxiety`
for volatility tempering, `quiz_responses.elo_delta` for per-response auditability.

---

## Elo update

Per response — student topic rating `S`, question rating `Q` (both 0–100):

```
expected = 1 / (1 + 10^((Q - S) / D))          # D spread constant, tune ~16–25
raw      = score - expected                     # score = 1 correct, 0 wrong
newS     = clamp(S + K * weight * raw, 0, 100)
```

- **K (dynamic):** `K = K_min + (K_max - K_min) * exp(-attempts / τ)`.
- **weight** = product of bounded modifiers (each ≈ [0.15, 1.3]):
  - **effort gate** — `effort_weight` from the guessing-detection section above
    (rapid-guess ≈ 0.15, idling ≈ 0.4, engaged = 1.0).
  - **speed modifier** — among engaged responses, faster-than-expected correct
    answers push weight > 1; slow correct answers < 1.
  - **slip guard** — an engaged-pace (not rapid-guess), wrong answer from a
    high-`S` student on a low-`Q` item ⇒ cap the downward move (statistically more
    likely a slip/carelessness than a real knowledge gap).
  - **fatigue** — high `position` errors slightly discounted.
  - **churn** — high `answer_changes` ⇒ dampened (more indecision, less signal).
- **forgetting** — for a stale topic (large `now - updated_on`), nudge `S` toward
  50 and/or raise K before the update. Function of the existing `updated_on`.

---

## Backend Changes

- **Prerequisite:** finish (or stub) the spec-08 trio — `mastery.service.js`,
  `mastery.controller.js`, `mastery.routes.js` — and `frontend/src/pages/Onboarding.tsx`;
  `backend/server.js:8` and `frontend/src/App.tsx` already import them, so the app
  won't boot until they exist. The engine lives beside `getTopicElo` in
  `mastery.service.js`.
- **`backend/services/mastery.service.js`** — `updateFromQuiz(studentId, graded[])`:
  the update above; reads current Elo/attempts via `getTopicElo`, upserts
  `student_topic_mastery`. Export the tuning constants (K bounds, `D`,
  effort-gate thresholds).
- **`backend/services/quiz.service.js` `submit()`** — add `topic_id` to the
  questions `select` (needed for the upsert); after the `quiz_responses` insert,
  call `mastery.updateFromQuiz(...)` with per-response signals.
- **`backend/utils/validate.js` `validateSubmit`** — accept optional
  `answer_changes ≥ 0`, `position ≥ 1`; reject out-of-range.
- Persist the two new fields in the existing `quiz_responses` bulk insert.

## Frontend Changes

- **`frontend/src/pages/Quiz.tsx`** — reuse the existing per-question timing
  pattern to also count `answer_changes` (increment whenever the selected option
  changes before moving on) and record `position` (index shown). Both are silent
  bookkeeping — no new UI element, no interruption to the quiz-taking flow.
  Include both in the submit payload.
- **`frontend/src/lib/quiz.ts`** — add the two fields to the submit request type.

## API Changes

`POST /api/quiz/submit` request `responses[]` items gain optional
`answer_changes`, `position`. Response contract otherwise unchanged.

## AI / RL Changes

This is the Phase-4 RL step spec 08 anticipated: per-quiz batch Elo update reading
`getTopicElo` and writing `student_topic_mastery`. Adaptive quiz *composition*
(using the updated Elo to pick the next quiz's difficulty) remains a later feature.

## Supabase Changes

Run the `db/update.sql` spec-09 section once (non-destructive: defaulted/nullable
columns). `db/schema.sql` updated so fresh builds include the columns.

---

## Risks

1. **Self-reported confidence was cut.** An earlier draft added a 3-way
   confidence tap per question. Rejected: a mid-quiz prompt costs time and
   attention on every single question, and directly works against the goal of
   reading a student's natural state rather than perturbing it. All personalization
   here is behavioral/passive instead.
2. **Rapid-guess misclassification.** A fast, genuinely effortful answer (a
   strong student on an easy, familiar item) can look like a guess. Mitigated by
   using time as a *dampener* (weight 0.15), not a hard drop, and by the
   independent slip guard catching the complementary case.
3. **Non-transactional writes.** submit's existing three writes (spec 03 Risk 2)
   gain a fourth (mastery upsert); same MVP trade-off, RPC is the upgrade path.
4. **Tuning is empirical.** K bounds, `D`, and modifier ranges/thresholds need
   calibration; ship conservative defaults, revisit with real response-time data.

---

## Definition of Done

- [ ] `quiz_responses` has `answer_changes` / `position` in both `schema.sql` and
      `update.sql`; migration runs clean on Supabase.
- [ ] `mastery.service.updateFromQuiz` updates `student_topic_mastery` per the Elo
      math; `submit()` calls it with `topic_id` + the new signals.
- [ ] Missing signals fall back to neutral weights; `validateSubmit` rejects
      out-of-range values; client grading never trusted.
- [ ] Backend self-check test (style of `quiz.roundrobin.test.js`): correct/wrong
      direction, rapid-guess barely moves Elo (weight ≈0.15 not 0), slip guard caps
      an easy-miss by a strong student, K shrinks with attempts, clamp 0–100.
- [ ] End-to-end in browser: answer (change some answers) → submit → confirm
      `student_topic_mastery` updated and `quiz_responses` carry the new signals.
      No new prompts appear during the quiz.

---

## Sources

- Wise & Kong, *Response Time Effort* — researchgate.net/publication/248940611
- Nagy et al., rapid guessing & persistence — onlinelibrary.wiley.com/doi/full/10.1111/jcal.12719
- Baker et al., contextual slip/guess in BKT — link.springer.com/chapter/10.1007/978-3-540-69132-7_44
- Uncertainty-aware Knowledge Tracing — arxiv.org/pdf/2501.05415
- Pelánek, *Elo Rating System in Adaptive Educational Systems* — fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- Dynamic K value for Elo in adaptive learning — link.springer.com/article/10.1007/s11257-025-09439-z
- Cognitive fatigue and standardized tests — researchgate.net/publication/294896070
- Test anxiety in online exams — pmc.ncbi.nlm.nih.gov/articles/PMC9715417/
- Ebbinghaus / forgetting curve in digital learning — eduww.net (Ebbinghaus curve)
