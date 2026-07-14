# Spec 08 — Student Elo Baseline (Onboarding Probe)

Status: Draft — awaiting approval
Branch: main
Depends on: 01-database-schema, 02-authentication

---

## Overview

Every student's per-topic mastery is tracked as an Elo number (0–100) in a new
`student_topic_mastery` table. A student with no history has **no row**, and any
missing row is read as the default Elo **50**.

Right after registration we run a short **proficiency probe**: hardcoded
self-assessment questions (same for every student) that produce a per-**area**
baseline Elo. For each subject the student first picks last year's marks band
(the subject's baseline), then rates confidence 1–5 stars for **five sub-areas**
of that subject (e.g. Chemistry, Algebra). Rating Chemistry highly nudges the Elo
of every Chemistry topic up; rating it low nudges them down. The seeded Elo is
`subject_baseline + area_delta`, so the student's first quiz per area is already
roughly calibrated instead of everyone starting at 50.

The student can:
- **Answer the probe** → per-area baseline Elo (marks + 5 star ratings per subject).
- **Set manually** → one Elo (0–100) applied to all subjects/areas.
- **Skip** → no rows written; everything stays at the default 50.

This is the first feature to touch the Adaptive Mastery layer. It creates the
`student_topic_mastery` table and a `mastery` service the Phase-4 Elo engine
will extend.

---

## User Story

> As a new student, after I create my account I answer a couple of quick
> questions about last year's marks and rate how confident I feel in each area of
> Maths and Science, so my first quizzes are pitched per-area at roughly the right
> level instead of assuming I know nothing.

---

## Functional Requirements

1. On successful registration, the student lands on an **onboarding probe** page
   (not the dashboard).
2. The probe is **hardcoded and identical for every student** — no AI, no DB
   lookup for the questions. Area labels are stable across class 9 and 10; the
   backend resolves each area to that class's chapters.
3. Order: **all Maths questions first** (marks band, then 5 star questions), then
   **all Science questions** (marks band, then 5 star questions). 12 inputs total,
   each a single tap → target ≈ 1–1.5 min.
4. Marks band → subject **baseline** Elo (fixed table). Each star rating (1–5) →
   an **area delta** added to that subject's baseline. Unrated area = 3 stars
   (delta 0).
5. **Set manually** bypasses the questions: one Elo (0–100) for all topics.
6. **Skip** leaves the student at default 50 everywhere and writes nothing.
7. The probe appears **only immediately after registration**. Returning logins go
   straight to the dashboard and are never re-prompted.
   <!-- ponytail: gate on the register→onboarding navigation, no `onboarded`
        column. Add a flag only if we later need to re-surface the probe. -->
8. Seeding is **idempotent-safe**: rows are upserted on the PK so a double-submit
   can't duplicate or stack Elo.
9. All Elo values clamped to 0–100. Missing row ⇒ 50 at read time. Rows equal to
   50 are **not** written (default covers them).

---

## Database Changes

New table (canonical form added to `db/schema.sql`; migration already written in
`db/update.sql`):

```sql
create table student_topic_mastery (
  student_id  uuid    not null references students(student_id) on delete cascade,
  topic_id    integer not null references topics(topic_id),
  elo         smallint not null default 50 check (elo between 0 and 100),
  attempts    integer not null default 0,
  updated_on  timestamp not null default now(),
  primary key (student_id, topic_id)
);
create index on student_topic_mastery (student_id);
```

Design notes:
- **No row = default 50.** Skip and any area whose final Elo lands on 50 write
  nothing. Honours "don't store derivable data."
- The probed baseline is the **one thing legitimately stored** here that is *not*
  derivable from `quiz_responses` — self-reported prior knowledge. A rebuild from
  responses must start from the stored baseline (or 50), not a hard 50. See Risks.
- `attempts = 0` for seeded rows: a baseline is a prior, not an earned attempt.

No changes to existing tables.

---

## Probe Content (hardcoded)

### Marks band → subject baseline Elo
| Answer | Baseline |
|---|---|
| Below 40% | 35 |
| 40–60% | 45 |
| 60–80% | 60 |
| Above 80% | 75 |
| (skipped) | 50 |

### Star rating → area delta
| Stars | Delta |
|---|---|
| ★ (1) | −10 |
| ★★ (2) | −5 |
| ★★★ (3) | 0 |
| ★★★★ (4) | +5 |
| ★★★★★ (5) | +10 |

Final per-topic Elo = `clamp(subject_baseline + area_delta, 0, 100)`.

### Questions

**Maths** — Q0 marks: *"How were your Maths marks last year?"* (band)
Then rate confidence 1–5★:
1. **Algebra** — equations, polynomials, number systems
2. **Geometry** — lines, angles, triangles, circles
3. **Coordinate & Trigonometry**
4. **Mensuration** — areas, surface areas & volumes
5. **Statistics & Probability**

**Science** — Q0 marks: *"How were your Science marks last year?"* (band)
Then rate confidence 1–5★:
1. **Chemistry** — matter, atoms, reactions, acids & bases
2. **Mechanics & Electricity** — motion, force, current
3. **Waves, Light & Sound**
4. **Biology** — cells, life processes, heredity
5. **Environment & Energy** — resources, ecosystems

### Area → chapters (backend `AREA_CHAPTERS`; class filter picks the right ones)

**Maths**
- **Algebra**: Number Systems, Real Numbers, Polynomials, Linear Equations in Two Variables, Pair of Linear Equations in Two Variables, Quadratic Equations, Arithmetic Progressions
- **Geometry**: Introduction to Euclid's Geometry, Lines and Angles, Triangles, Quadrilaterals, Circles
- **Coordinate & Trigonometry**: Coordinate Geometry, Introduction to Trigonometry, Some Applications of Trigonometry
- **Mensuration**: Heron's Formula, Surface Areas and Volumes, Areas Related to Circles
- **Statistics & Probability**: Statistics, Probability

**Science**
- **Chemistry**: Matter in Our Surroundings, Is Matter Around Us Pure, Atoms and Molecules, Structure of the Atom, Chemical Reactions and Equations, Acids Bases and Salts, Metals and Non-metals, Carbon and Its Compounds, Periodic Classification of Elements
- **Mechanics & Electricity**: Motion, Force and Laws of Motion, Gravitation, Work and Energy, Electricity, Magnetic Effects of Electric Current
- **Waves, Light & Sound**: Sound, Light Reflection and Refraction, The Human Eye and the Colourful World
- **Biology**: The Fundamental Unit of Life, Tissues, Why Do We Fall Ill, Life Processes, Control and Coordination, How Do Organisms Reproduce, Heredity and Evolution
- **Environment & Energy**: Natural Resources, Sources of Energy, Our Environment, Management of Natural Resources

<!-- ponytail: chapter names that only exist for one class (e.g. Real Numbers /
     Number Systems) both live in the bucket; the topics query filters by the
     student's class, so only the right ones resolve. Any chapter not listed just
     stays at the subject baseline. -->

---

## Backend Changes

New layered trio (small; mastery is its own domain and the future Elo-engine home):

- `backend/services/mastery.service.js`
  - Exported constants: `MARK_BAND_ELO`, `STAR_DELTA`, `AREA_CHAPTERS`.
  - `getTopicElo(studentId, topicId)` → row Elo or 50 (used later by the engine).
  - `seedBaseline(studentId, payload)`:
    - `mode: 'skip'` → no-op, return `{ seeded: 0 }`.
    - `mode: 'manual'` → validate `elo ∈ [0,100]`; target = `elo` for every topic
      of the student's class in both subjects.
    - `mode: 'probe'` → per subject: `baseline = MARK_BAND_ELO[marks] ?? 50`; per
      area: `target = clamp(baseline + STAR_DELTA[stars ?? 3])`; resolve
      `AREA_CHAPTERS[subject][area]` → topics for the student's `class` (topics →
      chapters where `subject_id` matches and `chapters.class = student.class`).
    - **Upsert** `{student_id, topic_id, elo: target, attempts: 0}` for every
      resolved topic where `target ≠ 50`; skip topics landing on 50.
- `backend/controllers/mastery.controller.js` — thin: forwards `{status, body}`.
- `backend/routes/mastery.routes.js` — `POST /api/mastery/baseline`, auth
  middleware; `studentId` from the JWT, never the body.
- Register `mastery.routes` in `backend/server.js`.

Validation (never trust the frontend): reject unknown `mode`, unknown subject or
area keys, `stars ∉ 1..5`, unknown marks band, `elo` out of range.

---

## Frontend Changes

- New page `frontend/src/pages/Onboarding.tsx` (protected route `/onboarding`):
  - Steps through **Maths** then **Science**: a marks question (4 option cards)
    followed by 5 star-rating rows per subject; small progress indicator.
  - **Hover / levitation**: option and star cards lift (`hover:-translate-y-1`,
    `hover:shadow-lg`, `transition`); active selection floats subtly. Reuse
    existing card styling — no animation library.
  - Footer actions: **Skip for now** and **Set level manually** (reveals a 0–100
    slider + number applied to all subjects).
  - All answers held in **React state only** (the "cached numeric var") and POSTed
    **once** on Finish; then `navigate('/')`.
  - Loading / error / empty (submitting) states per Frontend Principles.
- `frontend/src/pages/Register.tsx`: on success `navigate('/onboarding')`.
- `frontend/src/App.tsx`: add `/onboarding` inside `<ProtectedRoute>`.
- `frontend/src/lib/api.ts`: add `seedBaseline(payload)` → `POST /api/mastery/baseline`.
- A small shared `STAR` component/rows; area labels come from a frontend constant
  mirroring the questions above (kept in sync with the backend area keys).

---

## API Changes

`POST /api/mastery/baseline` (auth required)

```json
{ "mode": "skip" }
{ "mode": "manual", "elo": 65 }
{
  "mode": "probe",
  "subjects": {
    "Maths":   { "marks": "high", "areas": { "Algebra": 5, "Geometry": 3, "Coordinate & Trigonometry": 4, "Mensuration": 2, "Statistics & Probability": 3 } },
    "Science": { "marks": "mid",  "areas": { "Chemistry": 5, "Mechanics & Electricity": 4, "Waves, Light & Sound": 3, "Biology": 2, "Environment & Energy": 3 } }
  }
}
```
`marks` ∈ `below40 | mid4060 | mid6080 | top80` (or omitted). `areas` values ∈ 1..5
(or omitted ⇒ 3).

Responses:
- `200 { "seeded": <rowsWritten> }`
- `400 { "error": "..." }` on invalid mode/marks/star/area/elo/subject.
- `401` if unauthenticated.

`studentId` from the JWT, never the body.

---

## AI Changes

None. Questions, area mapping, and Elo deltas are hardcoded and deterministic by
design. AI-driven placement is explicitly out of scope.

---

## RL Changes

Foundational only: creates `student_topic_mastery` and the seeding path the
Phase-4 Elo engine reads/writes (`getTopicElo`). The engine itself (per-quiz batch
Elo update, adaptive quiz composition) is **not** part of this spec.

---

## Supabase Changes

Run `db/update.sql` (spec-08 section, already written) once against Supabase:
creates `student_topic_mastery`, its index, grants `service_role`. `db/schema.sql`
is updated too so fresh setups include the table.

---

## Data Flow

```
Register (POST /api/auth/register) → token + student
        ↓ navigate('/onboarding')
Onboarding: Maths (marks + 5★) then Science (marks + 5★), held in React state
        ↓ Finish / Set manually / Skip
POST /api/mastery/baseline  (Bearer token)
        ↓ controller → mastery.service.seedBaseline
skip   → write nothing
manual → target = elo for all topics
probe  → per subject baseline = MARK_BAND_ELO[marks];
         per area target = clamp(baseline + STAR_DELTA[stars]);
         resolve AREA_CHAPTERS → class-appropriate topics
        ↓ upsert student_topic_mastery for topics where target ≠ 50
navigate('/') → Dashboard
        ↓ later: quiz engine reads getTopicElo() (row or 50)
```

---

## Risks

1. **Self-report is noisy.** Bands cap at 75 and star deltas at ±10, so a
   confident wrong guess only shifts Elo modestly; real quiz Elo corrects it fast.
2. **Baseline not derivable from responses.** A rebuild can't recover the seed;
   rebuild must start from stored baseline or 50. Document where the engine lands.
3. **Area grain, not per-chapter.** All topics in an area share one seeded Elo —
   the only signal we have pre-quiz. Fine; quizzes differentiate later.
4. **Frontend/backend area-key drift.** Labels are duplicated in both. Mitigation:
   backend validates keys and rejects unknowns (a drift fails loudly, not silently).
5. **Skip re-prompt.** No `onboarded` flag; correctness relies on only routing to
   `/onboarding` right after registration. A reload can just Skip. Acceptable.
6. **Double-submit.** Upsert on the PK — no duplicate/stacked Elo.

---

## Definition of Done

- [ ] `student_topic_mastery` in `schema.sql` and `update.sql`; migration runs
      clean on Supabase.
- [ ] `POST /api/mastery/baseline` seeds per-area for probe, flat for manual,
      nothing for skip; validates all input; `studentId` from JWT.
- [ ] Missing row reads as Elo 50 (`getTopicElo`); rows equal to 50 never written.
- [ ] Registration routes to `/onboarding`; returning logins do not.
- [ ] Onboarding: Maths then Science, marks + 5★ each, manual set, skip;
      hover/levitation; loading / error / empty states; ≈ 1–1.5 min.
- [ ] Answers held client-side and POSTed once.
- [ ] Backend self-check test (style of `quiz.roundrobin.test.js`) covering
      marks→baseline, star→delta, clamp, skip-50, and unknown-key rejection.
- [ ] No secrets exposed; Elo clamped 0–100 on the backend.
```
