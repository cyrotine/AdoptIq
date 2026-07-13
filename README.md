# AdaptIQ

AI-powered adaptive learning platform. The goal isn't a quiz website — it's
a system that learns what a student does and doesn't understand, and quietly
adjusts what it shows them next. This document is the current state of the
project: what's built, what's designed and agreed but not yet built, and
what's deliberately not on the table.

---

## What Works Today

- **Auth** — JWT-based registration/login, passwords hashed.
- **Question bank** — 800 NCERT-aligned MCQs across Maths and Science,
  classes 9–10, seeded via `db/qns_seed.sql`. Each question carries a
  `difficulty_score` (0–100) and a `difficulty_label` (Easy/Medium/Hard).
- **Quiz generation** (`POST /quiz/generate`) — student picks a subject and
  one or more chapters; backend pulls candidate questions, spreads them
  round-robin across chapters so none dominates, and fills an easy/medium/
  hard mix the client requests. Stateless — nothing is written until
  submit, so an abandoned quiz leaves no trace.
- **Quiz submission** (`POST /quiz/submit`) — grades server-side (never
  trusts the client's claimed answers), writes one `quiz_history` row and
  one `quiz_responses` row per question, updates the student's running
  `total_quizzes` / `correct_answers` counters.
- **Quiz history** — list of past quizzes and a full per-question detail
  view with explanations, reusing the same question data rather than
  duplicating it.

This is the whole MVP loop end to end: register → pick a chapter → take a
quiz → see results → review it later. What's missing is the "adapts to the
student" part — today's selection is round-robin, not personalized.

---

## The Adaptive Mastery Engine (agreed design, not yet built)

### Why Elo, and not Reinforcement Learning or a neural network

Both need far more data than this app has. RL needs thousands of episodes
to fill a state space; a neural knowledge-tracing model (the standard one,
DKT, is an LSTM) needs tens of thousands of students' worth of interactions
just to avoid memorizing noise instead of learning anything. AdaptIQ has
one or a handful of students. Feeding that little data into a large model
gets you a model that has perfectly memorized 300 answers and generalizes
to nothing.

Elo is the right amount of model for the amount of data available. It's
two numbers — one score per student per topic, one score per question —
updated with simple arithmetic, and it produces something meaningful after
a single answer instead of needing a training run. It's also *readable*:
"this student's Elo on ATP synthesis is 38" is a sentence a person can
reason about. A neural net's internal state is not.

The deeper reason it needs many students to fully work: a single wrong
answer is one clue with two unknowns — was the student weak, or was the
question hard? You can't tell from one data point. Only when *many*
students answer the *same* question can the two be told apart (if nobody
can answer it, the question is hard; if one person can when nobody else
could, that person is strong). This is why questions must be **shared**
across students, never generated fresh per student, and why a lone
student's Elo can only ever move the *student* side of the equation.

### The core formula

Both questions and students live on the same 0–100 scale.

```
p(correct) = 1 / (1 + 10^((questionElo − studentElo) / 15))
```

`15` is the scale constant — how much of an Elo gap corresponds to how much
of a probability shift. A tuning knob, not a derived value (see
[Tuning Constants](#tuning-constants-not-yet-validated) below).

### Two Elo numbers, and only one of them moves

**`questions.elo`** — frozen after creation. With one student, question
difficulty and student ability can't be separated (see above), so there's
nothing to learn it from. It's set once, from a structural prior at
generation time (a recall question seeds low, a multi-step question seeds
high), and left alone. Once the bank has enough students sharing enough
questions, a nightly job *could* start correcting these from real outcomes
— not needed yet, not built yet.

**`student_topic_mastery.elo`** — one row per (student, topic), default 50.
This is the number that actually moves, once per quiz, in `submit()`.

### Selection: floor / target / ceiling, not a fixed quota

Quiz generation stops asking for "6 easy, 12 medium, 12 hard" and instead
looks at the student's current Elo per topic and pulls a spread around it —
a couple of confidence-building questions below their level, most of the
quiz right at their level, a couple of stretch questions above it. Compute
`p(correct)` for every candidate against the student's Elo, and take the
ones closest to the target spread.

### Update: one batch calculation, not sequential

The naive version — updating Elo after each question in order — is wrong.
It assumes the student's ability *drifted* over the 10 minutes of the quiz,
which it didn't; and it makes the final score depend on the order questions
happened to appear in, which is meaningless. Instead, everything is scored
against the Elo the student walked in with:

```
expected = sum of p(correct) over every question, using the student's
           starting Elo for that topic
actual   = how many they actually got right
K        = K0 / (1 + attempts / 15), floor 1        // K0 = 6
new_elo  = starting_elo + K × (actual − expected)
```

`K` shrinks as more attempts accumulate on a topic — a brand-new topic
swings hard on the first quiz; a topic with 40 attempts behind it barely
moves on one more. This runs once per topic represented in the quiz, inside
`submit()`, right after grading.

### Difficulty labels: computed, not stored — cosmetic only

`Easy` / `Medium` / `Hard` stop being a column on `questions`. They become a
pure function, evaluated at read time, of the question's frozen Elo and
*the viewing student's own* Elo on that topic:

```
Easy:   questionElo < studentElo − 20
Medium: studentElo − 20 ≤ questionElo ≤ studentElo + 20
Hard:   questionElo > studentElo + 20
```

At the default starting Elo (50) this reduces to Easy 0–30 / Medium 30–70 /
Hard 70–100. As a student's Elo rises, more of the bank reads as Easy/
Medium and less as Hard — the badge reflects *their* growth, not a global
fact about the question.

This is **display-only**. It never feeds question selection — selection
already runs on the floor/target/ceiling logic above. Two systems trying to
personalize independently would fight each other; only one gets to decide
what the student actually sees.

Because it's computed at read time, the same question can show a different
badge in quiz history today than it did the day it was taken — intentional:
the badge answers "how hard is this for you *now*," not "how hard was it
then."

### Cold start: a short onboarding Q&A, computed once, stored as a seed

A brand-new student has no quiz history, so Elo defaults to a flat 50
everywhere — a reasonable but uninformed guess. Instead, after
registration, a short optional form (previous year's marks, self-rated
strong/weak subjects) computes a starting Elo per subject **client-side**,
and posts only the *result* — never the raw answers — to seed
`student_topic_mastery`. If skipped, everything just starts at 50 and
converges from real quiz attempts within a handful of questions (`K` is
deliberately high early on, so a bad guess is cheap and temporary). A
returning student's real evidence (`attempts > 0`) is never overwritten by
re-running onboarding.

---

## Database Changes Required

```sql
-- questions: the existing difficulty_score becomes the canonical elo;
-- difficulty_label is dropped entirely (computed at read time instead).
alter table questions rename column difficulty_score to elo;
alter table questions drop column difficulty_label;

-- new: per-student, per-topic ability. A cache, not a source of truth —
-- must be rebuildable by replaying quiz_responses through the update
-- formula above.
create table student_topic_mastery (
  student_id  uuid not null references students(student_id),
  topic_id    integer not null references topics(topic_id),
  elo         numeric(5,2) not null default 50 check (elo between 0 and 100),
  attempts    integer not null default 0,
  updated_on  timestamp not null default now(),
  primary key (student_id, topic_id)
);

create index on student_topic_mastery (student_id);
```

`elo`'s `check (... between 0 and 100)` constraint carries over unchanged
from `difficulty_score` — no range migration needed, just a rename.

`quiz_history` and `quiz_responses` are untouched by this design. Richer
behavioral signals (answer changes, revisits, position in quiz) were
discussed as future strengtheners of the update formula but are explicitly
**not** part of this pass — they'd need new columns on `quiz_responses`
and are their own piece of work if pursued later.

---

## End-to-End Workflow (once this ships)

1. **Register.** Optionally answer the onboarding Q&A; a starting Elo per
   subject is computed in the browser and posted once.
2. **Pick a subject + chapters.** Read-only.
3. **Generate a quiz.** Backend reads the student's Elo for every topic in
   those chapters (defaulting anything unseen to 50), pulls a floor/target/
   ceiling spread of questions from the bank, attaches a computed
   Easy/Medium/Hard badge per question for display, and returns 30
   questions with no answers or explanations. Nothing is written yet.
4. **Take the quiz.** Purely client-side; no backend calls.
5. **Submit.** Backend grades against the real answers, writes the quiz
   history and response rows, updates the running student counters — and
   now also runs one batch Elo update per topic, moving
   `student_topic_mastery` from where the student started the quiz to
   where their performance says they should be.
6. **View results / review history.** Read-only, joins in answers and
   explanations from the questions table. Badges reflect current Elo, which
   may have moved since the quiz was taken.
7. **Request the same chapter again.** The question bank hasn't changed —
   but the student's Elo has, so a different, better-targeted set of
   questions satisfies the floor/target/ceiling band this time. This *is*
   the adaptive behavior — nothing else needs to happen for it to work.

---

## Explicitly Not Built (and why)

- **Reinforcement learning.** Needs orders of magnitude more interaction
  data than this app will have for a long time. See above.
- **Live question-difficulty recalibration.** The math for a nightly job
  that corrects `questions.elo` from real outcomes exists and is sound —
  but it needs dozens of students to have answered the *same* question
  before there's a pattern to correct from. Dormant until then, not wired
  up.
- **Notes → question generation (Ollama).** A separate, offline, batch
  pipeline — never runs on a request path. Not yet built; the 800 seeded
  questions are the bank until it is.
- **Misconception-tagged distractors.** Worth doing once there's a real
  volume of wrong answers to learn from; not part of this pass.
- **Behavioral signals beyond `time_taken`** (answer changes, revisits,
  question position). Cheap to add later, deliberately deferred so this
  isn't scope-creeping past what was asked for.

---

## Tuning Constants (not yet validated)

Four numbers above are starting guesses, not derived values: the Elo
`SCALE` (15), the starting K-factor `K0` (6), its decay divisor (15), and
the label `BAND_WIDTH` (20 — deliberately shared between the label formula
and the selection spread, so the two can't silently drift apart, even
though they remain two separate mechanisms). Before trusting these in
production, they should be checked with a small synthetic-student script:
simulate a student with a known true ability, run them through ~200
questions, and confirm their Elo converges to the truth without
oscillating.
