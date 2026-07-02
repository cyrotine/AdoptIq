# Spec 01 — Database Schema

**Feature Number:** 01
**Feature Title:** Database Schema
**Feature Slug:** database-schema
**Branch:** main
**Status:** Draft — awaiting approval

---

## Overview

Formalize the AdaptIQ core relational schema exactly as defined in the approved
structure diagrams. This spec locks the seven MVP tables — **Students,
Subjects, Chapters, Topics, Questions, QuizHistory, QuizResponses** — their
columns, types, keys, constraints, and relationships.

This is the foundation every later feature (Authentication, Quiz Engine,
Result Page, Quiz History, and eventually Mastery + RL) builds on. No business
logic here — only the data contract.

The schema follows the normalized chain:

```
Students → QuizHistory → QuizResponses → Questions → Topics → Chapters → Subjects
```

---

## User Story

As a **developer building AdaptIQ**, I need a single authoritative,
normalized database schema so that every service reads and writes consistent,
derivable-free data, and so that a student's full journey (register → quiz →
responses → history) is persistable end-to-end.

---

## Functional Requirements

1. Seven tables exist exactly as specified below — no extra columns, no
   duplicated/derivable columns.
2. Every foreign key resolves along the normalized chain
   `Question → Topic → Chapter → Subject`.
3. Subjects are seedable (e.g. `Maths`, `Science`); Chapters and Topics hang
   off them by class.
4. A Question always resolves to exactly one Topic (and transitively one
   Subject + class).
5. A QuizHistory row summarizes one completed quiz; its per-question detail
   lives in QuizResponses.
6. All identity/security constraints hold: unique username, unique email,
   hashed password only, valid answer options, valid difficulty labels.

---

## Database Changes

### Students

| Field | Type | Constraints | Description |
|---|---|---|---|
| student_id | UUID | PRIMARY KEY, default `gen_random_uuid()` | Unique student identifier |
| name | VARCHAR(100) | NOT NULL | Full name of the student |
| username | VARCHAR(30) | NOT NULL, UNIQUE | Unique username for login/display |
| email | VARCHAR(100) | NOT NULL, UNIQUE | Unique email address |
| password_hash | TEXT | NOT NULL | Securely hashed password |
| class | SMALLINT | NOT NULL, CHECK (class IN (9,10)) | Student's class |
| total_quizzes | INTEGER | NOT NULL, default 0 | Total quizzes attempted |
| correct_answers | INTEGER | NOT NULL, default 0 | Total correctly answered questions |

### Subjects

| Field | Type | Constraints | Description |
|---|---|---|---|
| subject_id | SERIAL | PRIMARY KEY | Unique subject identifier |
| subject_name | VARCHAR(50) | NOT NULL, UNIQUE | e.g. Maths, Science |

### Chapters

| Field | Type | Constraints | Description |
|---|---|---|---|
| chapter_id | SERIAL | PRIMARY KEY | Unique chapter identifier |
| subject_id | INTEGER | NOT NULL, FK → subjects(subject_id) | Owning subject |
| class | SMALLINT | NOT NULL, CHECK (class IN (9,10)) | Class the chapter belongs to |
| chapter_name | VARCHAR(150) | NOT NULL | e.g. Number Systems |

### Topics

| Field | Type | Constraints | Description |
|---|---|---|---|
| topic_id | SERIAL | PRIMARY KEY | Unique topic identifier |
| chapter_id | INTEGER | NOT NULL, FK → chapters(chapter_id) | Owning chapter |
| topic_name | VARCHAR(150) | NOT NULL | e.g. Rational Numbers |

### Questions (Version 1.0)

| Field | Type | Constraints | Description |
|---|---|---|---|
| question_id | UUID | PRIMARY KEY, default `gen_random_uuid()` | Unique question ID |
| question_text | TEXT | NOT NULL | Complete question |
| option_a | TEXT | NOT NULL | Option A |
| option_b | TEXT | NOT NULL | Option B |
| option_c | TEXT | NOT NULL | Option C |
| option_d | TEXT | NOT NULL | Option D |
| correct_answer | CHAR(1) | NOT NULL, CHECK IN ('A','B','C','D') | Correct option |
| explanation | TEXT | nullable | Solution shown after submission |
| topic_id | INTEGER | NOT NULL, FK → topics(topic_id) | Foreign key to Topics |
| difficulty_label | VARCHAR(10) | NOT NULL, CHECK IN ('Easy','Medium','Hard') | Difficulty band |
| difficulty_score | SMALLINT | NOT NULL, CHECK (0–100) | Numeric difficulty |
| estimated_time | INTEGER | nullable | Expected solving time (seconds) |

### QuizHistory

| Field | Type | Constraints | Description |
|---|---|---|---|
| quiz_id | UUID | PRIMARY KEY, default `gen_random_uuid()` | Primary key |
| student_id | UUID | NOT NULL, FK → students(student_id) | Owning student |
| subject | VARCHAR(20) | NOT NULL | Maths / Science |
| easy_questions | SMALLINT | NOT NULL, default 0 | Number of Easy questions |
| medium_questions | SMALLINT | NOT NULL, default 0 | Number of Medium questions |
| hard_questions | SMALLINT | NOT NULL, default 0 | Number of Hard questions |
| correct_answers | SMALLINT | NOT NULL, default 0 | Number of correct answers |
| total_time_taken | INTEGER | nullable | Total time taken (seconds) |
| completed_on | TIMESTAMP | NOT NULL, default `now()` | Date & time completed |

### QuizResponses

| Field | Type | Constraints | Description |
|---|---|---|---|
| quiz_id | UUID | NOT NULL, FK → quiz_history(quiz_id) | Owning quiz |
| question_id | UUID | NOT NULL, FK → questions(question_id) | Answered question |
| student_answer | CHAR(1) | CHECK IN ('A','B','C','D') | Option selected by student |
| time_taken | INTEGER | nullable | Time spent on this question (seconds) |
| — | — | PRIMARY KEY (quiz_id, question_id) | One response per question per quiz |

### Indexes

- `chapters (subject_id)`
- `topics (chapter_id)`
- `questions (topic_id)`
- `quiz_history (student_id)`
- `quiz_responses (question_id)`

### Deltas vs. current `db/schema.sql`

The images require these changes to the currently committed schema:

1. **`questions.question_id` → UUID** (was `SERIAL int`).
2. **`quiz_responses.question_id` → UUID** FK (was `int`) — follows (1).
3. **`questions.difficulty_score`** SMALLINT (0–100) — **new column**, absent today.
4. **`quiz_history` columns renamed**: `easy_count/medium_count/hard_count`
   → `easy_questions/medium_questions/hard_questions`.
5. **`quiz_history.subject` → VARCHAR(20)** (was `int` FK to subjects).
6. Length-bounded VARCHARs and `class IN (9,10)` / `difficulty_score` checks
   added to match the images.

---

## Data Flow

```
Question (topic_id = 201)
   → Topic  "Rational Numbers"  (chapter_id = 101)
      → Chapter "Number Systems" (subject_id = 1, class = 9)
         → Subject "Maths"
```

Write path for a completed quiz:

```
Student completes quiz
  → 1 row inserted into QuizHistory (summary counts + timing)
  → N rows inserted into QuizResponses (one per question answered)
Correctness / accuracy is DERIVED at read time by joining
QuizResponses.student_answer against Questions.correct_answer.
```

---

## Backend Changes

- None functional in this spec. The schema is consumed by later specs
  (Auth, Quiz Engine). Only the DDL and seed layer are produced here.
- `db/schema.sql` will be updated to match this spec (see Deltas above).

## Frontend Changes

- None. This is a data-layer spec.

## API Changes

- None. No routes/controllers/services are added here.

## AI Changes

- None. `difficulty_score` and `difficulty_label` columns are provisioned so a
  future AI Difficulty step (Phase 3) has a target to write into via a service —
  AI never writes the DB directly.

## RL Changes

- None. Student Mastery tables are out of scope (Phase 2/4). This schema is the
  substrate the RL engine will later read from.

## Supabase Changes

- Apply the updated `db/schema.sql` once against the Supabase Postgres database.
- `gen_random_uuid()` is available via the built-in `pgcrypto`/`pg_catalog`
  functions in Supabase — no extension change required.
- Seed `subjects` (Maths, Science) and initial `chapters`/`topics` for class 9/10.
- No RLS policies defined in this spec (deferred to the Authentication spec).

---

## Risks

1. **Denormalization of `quiz_history.subject`.** Storing `subject` as
   `VARCHAR(20)` duplicates data derivable via
   `Question → Topic → Chapter → Subject`. This is a deliberate deviation from
   CLAUDE.md's "never duplicate derivable data" rule, chosen to match the
   approved image exactly. Accept the trade-off or normalize to an FK later.
2. **UUID question_id migration.** Switching `questions.question_id` from
   `SERIAL` to `UUID` breaks any existing seeded questions and any int-typed
   references. Since the DB is pre-MVP with no production data, apply as a clean
   re-create, not an in-place migration.
3. **`difficulty_score` sourcing.** The column is required NOT NULL; until the
   AI difficulty step exists, values must be seeded manually or defaulted.
   Decide a seed convention (e.g. map Easy=20 / Medium=50 / Hard=80).
4. **`class` domain.** Constrained to `(9,10)`; adding class 11/12 later needs a
   constraint change.

---

## Definition of Done

- [ ] `db/schema.sql` recreates all seven tables exactly as tabled above.
- [ ] All PKs, FKs, UNIQUE, CHECK constraints, defaults, and indexes present.
- [ ] `questions.question_id` and `quiz_responses.question_id` are UUID.
- [ ] `questions.difficulty_score` exists with a 0–100 CHECK.
- [ ] `quiz_history` uses `easy_questions/medium_questions/hard_questions` and
      `subject VARCHAR(20)`.
- [ ] Schema applies cleanly to a fresh Supabase Postgres DB with no errors.
- [ ] `subjects` seeded with Maths + Science; at least one chapter/topic/question
      chain seeded to prove the FK path resolves.
- [ ] `npm run db:test` connects and reads `subjects` successfully.
```