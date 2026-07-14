# Spec 07 — Question Difficulty Cleanup

**Feature Number:** 07
**Feature Title:** Question Difficulty Cleanup
**Feature Slug:** question-difficulty-cleanup
**Branch:** main
**Status:** Draft — awaiting approval

---

## Overview

The `questions` table encoded difficulty twice: a stored `difficulty_label`
(Easy/Medium/Hard) set independently of a numeric `difficulty_score`. Two
columns for one fact — which CLAUDE.md's Database Design Rules explicitly
forbid ("Don't store Difficulty Label... Calculate from the question's frozen
Elo... display-only, never consulted by selection").

This spec makes the numeric column the single source of truth and renames it
to the concept it actually represents — the question's frozen **Elo**:

1. **Drop `difficulty_label`** and every read/write/branch on it.
2. **Rename `difficulty_score` → `elo_question`** — the question's Elo (0–100),
   frozen at creation. This is the number the Adaptive Mastery engine (Phase 4)
   already expects per CLAUDE.md.
3. The Easy/Medium/Hard band becomes a **pure function of `elo_question`**,
   computed server-side wherever a label is needed — bucketing during quiz
   generation, composition counts, and the label returned to the frontend.

The API wire contract is **unchanged**: responses still carry a
`difficulty_label` field, now computed instead of echoed from a column. So
**no frontend changes**.

---

## User Story

As a developer, I want question difficulty stored once — as the question's
frozen Elo (`elo_question`) — so the displayed label can never drift from the
number, and so Phase 4's Adaptive Mastery engine reads the Elo column it was
always meant to.

---

## Functional Requirements

1. `questions.difficulty_label` column and its `CHECK` constraint are dropped.
2. `questions.difficulty_score` is renamed to `elo_question` (0–100 CHECK
   preserved). No other column semantics change.
3. A single banding function maps `elo_question` → `'Easy' | 'Medium' | 'Hard'`.
   Thresholds: `0–34` Easy, `35–64` Medium, `65–100` Hard — chosen to keep the
   existing seed values (20 / 50 / 80) safely inside their bands.
4. `quiz.service.js` `generate()`: candidate query selects `elo_question`;
   bucketing keys off the banding function.
5. `quiz.service.js` `submit()` and `getHistoryDetail()`: select
   `elo_question`; composition counts use the banding function; each result
   object carries a computed `difficulty_label` (not a raw column) so the
   response contract is unchanged. The raw `elo_question` is not exposed to the
   client.
6. Seed files (`db/seed.sql`, `db/qns_seed.sql`) drop the `difficulty_label`
   column from every insert and use `elo_question` for the numeric column.
7. No frontend changes. `frontend/src/lib/quiz.ts`'s `difficulty_label:
   Difficulty` field is populated by the backend's computed value — the wire
   contract is identical.

---

## Database Changes

**`db/update.sql`** (migration, run once against Supabase):

```sql
alter table questions drop column difficulty_label;              -- its CHECK drops with it
alter table questions rename column difficulty_score to elo_question;
```

The `rename ... from difficulty_score` is the only reference to the old
spec-01 column name that remains anywhere — it is the command that retires it.

**`db/schema.sql`** updated to match a fresh build: `difficulty_label` removed,
the numeric column defined as
`elo_question smallint not null check (elo_question between 0 and 100)`.

---

## Backend Changes

```
backend/services/quiz.service.js
  + bandFromScore(elo)            # elo -> 'Easy' | 'Medium' | 'Hard'
  generate():          select elo_question, bucket via bandFromScore
  submit():             select elo_question, compose via bandFromScore,
                         attach computed difficulty_label per result
  getHistoryDetail():   select elo_question, attach computed difficulty_label
```

No route, controller, or `validate.js` changes — request/response contracts
are unchanged, only the source of the label flips from column to formula.

## Frontend Changes

None. `difficulty_label` remains a field on the Question/Result JSON.

## API Changes

None. Response shapes unchanged. `difficulty_label` is now guaranteed
consistent with the question's Elo by construction (can't drift).

## AI Changes

None.

## RL Changes

None yet, but this is the enabling step for Phase 4. `elo_question` is the
frozen per-question Elo the Adaptive Mastery engine reads when it updates a
student's `StudentTopicMastery` Elo. Naming it correctly now means Phase 4
consumes an existing column rather than renaming one.

## Supabase Changes

Apply `db/update.sql` once against the Supabase Postgres database.
No RLS/policy changes.

---

## Data Flow

```
generate(): questions (elo_question) --bandFromScore--> bucket key (Easy/Medium/Hard)
submit()/getHistoryDetail(): questions (elo_question) --bandFromScore--> composition + result.difficulty_label
```

Consumer-facing flow (Dashboard → generate → take → submit → result/history)
is unchanged; only where the label comes from changes.

---

## Risks

1. **Banding thresholds are a judgment call.** The 34/64 split keeps today's
   seed values (20/50/80) safely inside their bands. A future AI-generated
   question landing near a boundary may band slightly differently than a human
   author's intent. Acceptable — CLAUDE.md marks the label display-only;
   selection never consulted the label text, only its band.
2. **`db/update.sql` is destructive** — drops a column and renames another.
   Only seed/dev data exists today (no production), but it must be applied
   consciously against Supabase, not auto-run by this spec. A DB already built
   from spec 01 needs both statements; a DB rebuilt fresh from `db/schema.sql`
   needs neither.

---

## Definition of Done

- [ ] `db/update.sql` drops `difficulty_label` and renames the numeric column
      to `elo_question` cleanly against a live Supabase DB.
- [ ] `db/schema.sql` defines `elo_question` and no longer defines
      `difficulty_label` or `difficulty_score`.
- [ ] `quiz.service.js` selects `elo_question`; `generate()`, `submit()`, and
      `getHistoryDetail()` all derive the label via `bandFromScore`. No
      `difficulty_label`/`difficulty_score` column is read or written.
- [ ] `db/seed.sql` and `db/qns_seed.sql` use `elo_question` and no longer
      supply `difficulty_label`.
- [ ] End-to-end in browser: generate → take → submit → result → history
      detail; difficulty badges render exactly as before.
