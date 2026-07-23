# Spec 16 — Frontend Redesign ("Night Instrument")

A complete UI/UX redesign of every page in the AdaptIQ frontend. Presentation
only: every API call, payload, route, guard, state transition and validation
stays byte-identical. The skin changes; the brain does not.

---

## Overview

The current frontend is a light "calibration instrument" theme: steel face,
engraved hairlines, a graduated tape as the one recurring motif. It is
coherent and honest, but it reads as a paper worksheet — quiet, static,
editorial. The goal is a premium, dark-first, animated product in the
Linear / Vercel / Raycast register that still feels like *AdaptIQ* and not a
template.

**Design thesis — "Night Instrument."** AdaptIQ's real identity is that it
*measures* students on a 0–100 Elo scale. We keep that instrument DNA — the
graduated tape, the gauge, real counts drawn as real marks — and move it into
a dark observatory: a deep blue-black void, glass instrument panes floating
over faint glow, marks that are *luminous* instead of engraved. Precision
instruments at night is a real visual tradition (cockpits, observatories,
oscilloscopes) and it is not one of the AI-default looks. The signature
element of the whole app is **the luminous tape**: 30 glowing ticks that are
always a real count — the mix you're building, the questions you're
answering, the verdicts you earned — now animated with light.

### Audit — current problems

1. **Visual energy.** Zero motion outside one result-page keyframe. No page
   transitions, no hover depth, no skeletons (loading is a mono one-liner).
2. **Landing experience is missing.** `/` is the protected dashboard;
   logged-out visitors hit a bare login form with no idea what AdaptIQ is,
   why it adapts, or what Elo means.
3. **Dashboard reads as a form**, not a learning home: no greeting, no
   trend, no derived insight from the history the API already returns
   (dates, accuracy, per-difficulty counts, time).
4. **Quiz page is a worksheet.** Everything on one static column; options are
   plain bordered rows; no keyboard control; no sense of progress beyond the
   tape; submit is just a button.
5. **Result page under-celebrates.** Score is static text; no count-up, no
   accuracy/time analytics beyond one line, no per-difficulty breakdown even
   though `composition` and per-question results are in the payload.
6. **Hierarchy is flat.** One column, one text scale for almost everything;
   eyebrows do all the work. Little depth: no elevation system beyond
   plate/well.
7. **Empty/loading states are minimal** (`Quiet` = one grey mono line) —
   functional, never inviting.
8. **Mobile is serviceable but untuned**: the quiz option rows and dashboard
   sliders are fine, but rails, tapes and admin rows compress awkwardly under
   380 px; touch targets on tape ticks are ~12 px wide.
9. **Icons are absent entirely** — every affordance is text.
10. **Accessibility is actually decent** (focus-visible, aria-pressed,
    reduced-motion clamp, non-color difficulty encoding) — the redesign must
    not regress it.

### What we deliberately keep

- The **data-honest motif system** (Tape, Gauge, DifficultyBadge rungs) —
  reborn luminous, not discarded. It is the most distinctive thing the app
  owns.
- The type trio — **Archivo** (display, wide axis), **Newsreader** (long-form
  reading: questions, explanations), **IBM Plex Mono** (every number) — an
  unusual, characterful pairing worth keeping; the redesign re-weights and
  re-scales it rather than replacing it.
- All component/data wiring, all a11y behaviors.

---

## User Story

As a student, when I open AdaptIQ I want it to feel like a precise,
intelligent, alive instrument that knows me — so that practicing feels like
using a premium product, not filling in a worksheet — while everything I
could do before works exactly the same.

---

## Functional Requirements

1. Every existing user flow works identically: register → onboarding →
   dashboard → generate quiz → answer 30 → submit → result → review history;
   admin login → topic stats → generation workspace → accept/reject → finish.
2. No API request or payload changes shape, order or timing (one exception
   class: none — even `refresh()` timing stays).
3. Dark mode is the primary and only theme in v1 (light mode deferred; the
   token layer makes it a later drop-in).
4. New presentation dependencies only: `framer-motion`, `lucide-react`.
5. Reduced motion, keyboard navigation and WCAG AA contrast are hard
   requirements, not polish.

---

## Design System

### Color — "Night Instrument" palette

Deep blue-black, never pure #000. One intelligent accent (iris), one warm
counterpoint (ember) used sparingly, and the difficulty scale re-tuned as
luminous marks. All text pairs below clear 4.5:1 on their stated grounds.

| Token | Hex | Role |
|---|---|---|
| `--color-void` | `#0A0D16` | App background (deep blue-black) |
| `--color-pane` | `#111624` | Surface: glass panes, cards |
| `--color-raise` | `#1A2135` | Raised/hover surface |
| `--color-ink` | `#EEF1F8` | Primary text |
| `--color-muted` | `#98A0B3` | Secondary text |
| `--color-rule` | `rgba(255,255,255,.09)` | Hairlines, borders |
| `--color-iris` | `#8A93FF` | Primary accent — needles, focus, CTAs, links |
| `--color-iris-deep` | `#4F46E5` | Pressed/gradient stop |
| `--color-ember` | `#F5B84A` | Warm counterpoint: streaks, highlights, warning/medium |
| `--color-easy` | `#3ECF8E` | Success / easy |
| `--color-medium` | `#F5B84A` | Warning / medium (shares ember) |
| `--color-hard` | `#F4638B` | Danger / hard |

Gradient recipe (used only in hero text, primary CTA, and the ambient orbs):
`iris → iris-deep` at 135°. Glow recipe: `0 0 24px color-mix(in srgb, token
35%, transparent)` — glows are reserved for *live* readings (current tick,
needle, score), never decoration.

### Depth system

Three elevations, replacing plate/well:

- **void** — the page itself, carrying the ambient background.
- **pane** — `bg-pane`, 1px `rule` border, `backdrop-blur` *only* when it
  overlaps the ambient orbs (header rail, dialogs); radius 14px.
- **raise** — interactive rest→hover states lift `pane → raise` plus a 1px
  brighter top edge (`inset 0 1px 0 rgba(255,255,255,.06)`).

Glass is budgeted: at most 2 backdrop-blur layers per viewport (header +
one), everything else is flat translucency — this is the performance and
taste guard against glassmorphism soup.

### Ambient background (all pages)

A fixed, GPU-cheap stack, one component (`Ambient`): two blurred radial orbs
(iris at 8% alpha top-left, ember at 5% bottom-right) drifting on a 40 s
CSS transform loop; a faint 64px grid (two linear-gradients at 3% alpha)
masked to fade out below the fold; a tiled 128px noise PNG (data-URI, ~1 KB)
at 2.5% opacity. No canvas, no JS particles, no scroll listeners. Frozen
under `prefers-reduced-motion`.

### Typography

| Role | Face | Treatment |
|---|---|---|
| Display / hero | Archivo, `wdth 118–125`, 800 | Clamp scale: hero `clamp(2.5rem, 6vw, 4.5rem)`, page titles `2.25rem`, tight leading 1.02, `-0.02em` tracking |
| UI / body | Archivo 400–600, normal width | 15–16px, 1.5 leading |
| Reading | Newsreader 400–500 | Question text (22px quiz, 17px review), explanations; the "made for reading" voice |
| Data | IBM Plex Mono 400–600 | Every number, eyebrow labels (11px, 0.14em tracking, uppercase), timers, Elo values — always `tabular-nums` |

`index.html` font link unchanged except adding no new families. Type scale is
formalized as utilities so pages stop hand-tuning `text-[15px]`.

### Iconography

`lucide-react`, outline, `strokeWidth 1.75`, sizes 16 (inline) / 20 (buttons,
nav) / 28 (empty states). Icons never appear without a text label except in
icon-buttons that carry `aria-label`.

### Spacing & layout

4px base. Page rhythm: sections separated by 56px (was 56–64, kept), pane
padding 24px, control height 44px (touch target floor). Reading column stays
`max-w-2xl` / `max-w-3xl` wide via the existing `Shell` prop — single-column
focus is a strength, not a bug; the redesign adds *depth*, not columns.

### Motion system (framer-motion)

| Layer | Spec |
|---|---|
| Page transitions | `AnimatePresence` keyed on `location.pathname` inside a presentational wrapper (routing table untouched): fade + 12px rise, 250ms `easeOut` in / 150ms out |
| List staggers | Children stagger 30ms, 250ms each (subjects, chapters, history, candidates, review) |
| Micro-interactions | Buttons: scale 0.98 on press, 150ms; option select: spring `stiffness 500, damping 30` on the letter chip; hover lifts via CSS only |
| Counters | Score and stats count up 800ms with `animate()`; skipped under reduced motion |
| Tape | Live tick gets a breathing glow (2s CSS loop); result reveal keeps the existing 14ms/tick stagger, now with glow trail |
| Skeletons | Shimmer via CSS gradient animation on `pane`-toned blocks; every fetch state that today renders `Quiet("Loading…")` gets a shaped skeleton instead |
| Celebration | Result ≥ 80%: one 1.2s burst of 24 CSS-animated luminous ticks rising from the score (no confetti lib); never on < 80% |

All motion routes through `useReducedMotion` + the existing global CSS clamp.
Durations never exceed 400ms; nothing loops except ambient drift and the
current-tick glow.

### Component library (all presentational, in `components/ui.tsx` unless noted)

Buttons (solid-gradient primary / ghost / quiet-icon), Input + floating-focus
Field, Select, Checkbox row, Range slider (restyled native input), Badge,
`DifficultyBadge` (kept, re-lit), Tape + Gauge (kept, re-lit, ticks widen to
≥ 24px touch targets), Skeleton, EmptyState (icon + line + CTA), Notice
(error), Toast is **not** added (nothing needs it today — YAGNI), Dialog is
**not** added (no modal flows exist), Tabs/Accordion/Pagination/Breadcrumbs
**not** added (no page needs them; adding them unused violates the project's
own rules). The component list follows the app's real needs, not the
catalog.

---

## Page-by-Page Redesign (mock descriptions)

### 1. Landing experience — decided: both surfaces

Approved decision (supersedes the earlier Option A/B choice): a standalone
public `/welcome` showcase **and** a fast split `/login`.

- **`/welcome`** — the product showcase: "Learning, Measured." hero with a
  large drifting Gauge, how-it-works sequence, an interactive Elo demo the
  visitor can push up and down, feature grid, honest stats strip, closing
  CTA. One additive public route in `App.tsx`; no existing route, guard or
  redirect changes — unauthenticated `/` still lands on `/login`.
- **`/login`** — focused split authentication (below); returning users
  never sit through marketing.
- **Post-login calibration transition** — after a successful `login()` /
  `adminLogin()`, a full-screen "Calibrating your learning profile…"
  overlay shows for ~800 ms before the same `navigate` call fires
  (immediately under reduced motion). Same auth call, same destination;
  a delayed navigate only.
- Testimonials remain deferred until real ones exist — no fake quotes.

### 2. Login (`/login`) — split landing + auth

Left panel (hidden below `lg`): on the void with ambient orbs — eyebrow
"ADAPTIVE PRACTICE · CLASS 9 & 10", hero display line "Practice that
*measures* you." (gradient on the verb), three compact feature rows with
Lucide icons (Target: placed on a 0–100 scale · Sparkles: every test built
for your level · TrendingUp: mastery that moves as you do), and a **live Elo
demo**: a miniature Gauge whose needle drifts between 42→68 on a 6s loop
with the caption "your level, recalculated after every test" — the Elo
story told visually in one instrument. Bottom: three static stat chips
(30 questions/test · 2 subjects · 0–100 scale) — honest numbers, no fake
testimonials on the auth page.

Right panel: a glass pane (this page's one blur budget) with the wordmark,
"Welcome back", the student/admin segmented control (same `role` state),
floating-label inputs (label rides up on focus/filled, iris glow border),
password visibility eye-toggle (Lucide Eye/EyeOff — presentation state
only), the gradient CTA with press scale and a working-state shimmer, and
the register link. Social login: omitted — placeholder buttons that do
nothing erode trust on a real product; noted as future work when a provider
exists. Error `Notice` slides down 150ms.

### 3. Register (`/register`)

Same split shell, right pane swaps via shared-element crossfade (the pane
itself persists between /login and /register through the page transition).
Fields gain inline hint text (username pattern, password length — same HTML
validation attributes, now with visible microcopy). CTA "Create account".
Left panel highlights the onboarding promise: "Two minutes to placement."

### 4. Onboarding (`/onboarding`) — "Configure your tutor"

Transformed from one long form into a **stepped experience with a progress
constellation** (dots + connecting line, mono step labels) — all local UI
state; the single `seedBaseline` POST on finish is unchanged, skip and
manual paths preserved.

- Step 1 — Maths marks band: four large selectable panes with mono
  percentage art, one tap advances (Back always available).
- Step 2 — Maths areas: the five Detent rows, re-lit (luminous rungs, the
  selected rung glows), each row staggers in.
- Steps 3–4 — Science, same pair.
- Manual path ("Set level myself") becomes a full-screen single control: the
  luminous Gauge huge in the middle, slider beneath, live mono readout.
- Finish: the constellation completes, a 1s luminous-tick burst plays
  ("Placed. Building your practice…") while the POST resolves, then
  navigate as today. Errors return you to the last step with the Notice.

Progress is visualized, transitions are 250ms slides, and every choice is a
pane, not a radio — "configuring an AI tutor", delivered with the existing
payload.

### 5. Dashboard (`/`) — the observatory

Rail (glass, blur budget #1): wordmark, right side `@username · Class 9`
eyebrow + logout icon-button.

- **Header block**: time-aware greeting eyebrow ("GOOD EVENING") over the
  student's name in display type. Right-aligned: **practice streak** chip
  (ember flame icon + "N-day streak") — *derived client-side from
  `history` dates, no new API*.
- **Reading row**: the Gauge (overall accuracy, luminous needle, count-up on
  mount) beside two mono stat tiles (tests taken, correct answers) and an
  **accuracy sparkline** of the last 10 quizzes — again derived from
  `history` already fetched. Skeletons shaped like all three while loading.
- **New test** (the core flow, unchanged in logic): subjects as depth panes
  with icon + hover lift; chapters as check-panes in a stagger grid;
  the **Mix builder** keeps sliders + the live Tape, now luminous with the
  remaining ticks pulsing faintly until assigned; the CTA is the gradient
  bar showing "Start test · 30 questions". Validation states identical.
- **Past tests**: each row a pane with subject in display type, luminous
  proportion bar, mono date/time/score, Review ghost button; staggered in;
  beautiful EmptyState (telescope icon, "Your first test will show up here",
  CTA scrolls to New test).

Excluded honestly: mastery radar, topic heatmap, AI suggestions,
achievements — no student-facing endpoints expose that data, and the backend
is frozen by this spec's own rules. Listed in Risks as future specs.

### 6. Quiz (`/quiz`) — focus mode

The most important page. One question per screen (already true), now an
immersive instrument:

- Rail: subject eyebrow, `n/30 · answered` mono readout, and an **elapsed
  time** mono readout (driven by the *existing* `times`/`enteredAt` refs'
  display equivalent — a local ticker; recorded payload logic untouched).
  The Tape lives in the rail as today: current tick tall with breathing
  glow, answered ticks lit in difficulty color, all ticks ≥ 24px touch.
- Question: chapter·topic eyebrow, then the question in Newsreader at 22px
  — large, readable, the hero of the screen. DifficultyBadge rungs glow.
- Options: four panes with the letter in a mono chip; hover lifts and lights
  the chip; **selection springs** the chip to iris with a 150ms glow pulse —
  tactile, instant. `aria-pressed` kept.
- **Keyboard**: `1–4` / `A–D` select (calls the same `selectOption`),
  `←/→` navigate (same `goTo`), `Enter` next / submit on last. A collapsed
  hint row (`kbd` chips) sits under the options on desktop.
- Question transitions: 200ms slide in direction of travel; answered state
  writes the tick to the tape with a small glow trail.
- Footer: Previous ghost / Next gradient; last question swaps Next for
  "Submit test" with the answered-count beside it ("27 of 30 answered") so
  submitting early is informed, not accidental. Submit shows shimmer state.
  Error Notice unchanged.
- Confidence selector: **excluded** — the submit payload is frozen, and a
  control that records nothing would be a fake instrument.

### 7. Result (`/result`) — the reading lands

- Score: mono digits **count up** 0→score over 800ms, `/30` in muted,
  under an eyebrow "SCORE". ≥ 80% triggers the single luminous-tick burst.
- The verdict Tape reveals left→right (kept, now with glow trail) with the
  Correct/Wrong/Skipped legend.
- **Analytics row** (all from the existing payload): accuracy %, total time,
  and per-difficulty bars (correct/total within easy, medium, hard — derived
  from `results` + `composition`), each counting up in stagger.
- **Weak/strong strip**: topics grouped from `results` — "Strong: Algebra
  4/4 · Review: Optics 1/3" chips (derived client-side, zero new data).
- "Every question" review list: each result a pane with verdict edge-light
  (easy/hard/muted), options re-lit as today (edge + written verdict —
  color never the only signal), explanation in a Newsreader block behind a
  "Why" iris hairline. Staggered entrance.
- CTA back to dashboard (gradient). QuizReview (`/quiz/:id/review`) renders
  the same `ResultSummary` with skeleton loading and no celebration —
  identical component, one `celebrate` prop.

### 8. Admin panel (`/admin`) — professional SaaS

- Rail context "ADMIN", logout icon-button.
- Header: "Topics by demand" display title + note, then a **summary strip**
  derived from `topic-stats`: total topics, total asks, busiest topic —
  mono count-ups in three panes.
- Search field with Lucide Search icon (same client-side filter), result
  count live in the section head.
- Topic list: panes with topic name, chapter·subject eyebrow, the demand
  bar now luminous and relative-scaled (kept), mono ask-count, and a
  "Generate" ghost button with Sparkles icon. Rows stagger; skeleton rows
  while loading; filter-empty state with a helpful "clear filter" action.

### 9. Generation workspace (`/admin/generate/:topicId`)

- Upload form as a **drop-zone pane** (dashed rule, UploadCloud icon, file
  name confirmation) — same `<input type=file>` semantics and FormData
  payload; Elo + count inputs as mono fields side by side; gradient CTA
  with "Reading the notes…" shimmer during generation.
- Candidate cards: panes numbered in mono, Elo chip top-right, options with
  the correct answer edge-lit in easy-green, explanation block, and
  Accept (gradient, CheckCircle) / Reject (ghost, X) — Published /
  Already-in-bank states as lit chips. Rejected cards animate out
  (AnimatePresence exit, 150ms collapse).
- Generate More + grounded chat: chat turns as alternating edge-lit blocks
  (iris = you, rule = AdaptIQ), thinking state as a shimmer line; questions
  born from a reply nest under it exactly as today.
- Finish: full-width ghost button; saved confirmation as an easy-green lit
  chip before the existing 1.2s redirect.

### Route guards / boot

`ProtectedRoute` / `AdminRoute` loading screens become the wordmark with a
breathing tick animation instead of the bare eyebrow line — first paint sets
the tone.

---

## Database Changes

None.

## Backend Changes

None.

## API Changes

None. Every component consumes exactly the endpoints it does today, with
identical methods, payloads and response handling.

## AI Changes

None.

## RL Changes

None.

## Supabase Changes

None.

---

## Frontend Changes (file map)

| File | Change |
|---|---|
| `index.html` | `theme-color` → `#0A0D16`; title kept; fonts unchanged |
| `src/index.css` | New token set, depth/glow/skeleton/ambient utilities, motion-safe clamps (rewrite) |
| `src/components/ui.tsx` | **New** — Button, Field, Select, CheckRow, Slider, Badge, Skeleton, EmptyState, Kbd, StatTile |
| `src/components/Ambient.tsx` | **New** — background orbs/grid/noise |
| `src/components/Motion.tsx` | **New** — PageTransition wrapper, stagger presets, CountUp |
| `src/components/Shell.tsx` | Re-skinned rail/head/notice/quiet (API of the component kept) |
| `src/components/Tape.tsx` | Luminous re-light; tick touch targets ≥ 24px; glow trail on reveal |
| `src/components/AuthForm.tsx` | Split-shell AuthCard, floating Field, password toggle |
| `src/components/DifficultyBadge.tsx`, `QuestionReview.tsx`, `ResultSummary.tsx` | Re-skin + stagger/count-up |
| All 9 `src/pages/*` | Re-skinned per the mocks above; hooks/handlers/payloads untouched |
| `src/App.tsx` | Only if Option B chosen (one additive route); otherwise untouched |
| `package.json` | + `framer-motion`, + `lucide-react` |

Business-logic guarantee: every `useState`/`useRef`/`useEffect` that feeds an
API call, every handler body that builds a payload, `AuthContext`, `lib/api.ts`
and `lib/quiz.ts` are **not edited** (only imported). New state is
presentation-only (current step index, password visibility, ticker display).

---

## Data Flow

Unchanged end to end:

Login/Register → `AuthContext` → token in localStorage → guards render →
Dashboard fetches `/api/subjects` + `/api/quiz/history` → generate POST →
Quiz (router state) → submit POST → Result (router state) → Review fetches
`/api/quiz/history/:id`. Admin: `/api/admin/topic-stats` → session create
(multipart) → accept/generate-more/chat/finish. The redesign adds zero
fetches and removes zero fetches; all new dashboard/result insights (streak,
sparkline, weak/strong topics, per-difficulty bars) are pure client-side
derivations of responses already in memory — consistent with the "never
store what can be derived" rule.

---

## Accessibility

- Focus: 2px iris `focus-visible` ring kept globally; all custom controls
  remain real buttons/inputs/labels.
- Keyboard: full quiz keyboard map (new); everything else already tabbable
  and stays so; step onboarding operable by keyboard (panes are buttons).
- Contrast: all token text/ground pairs verified ≥ 4.5:1 (muted on pane is
  the tightest — 5.1:1); difficulty always encoded by rungs/labels, never
  color alone (kept).
- Reduced motion: global CSS clamp kept **plus** `useReducedMotion` gates on
  counters, bursts, page transitions, ambient drift.
- ARIA: existing `aria-pressed/current/label/role=alert` inventory preserved
  verbatim; new icon-buttons all carry `aria-label`; count-ups render final
  values in the DOM immediately for screen readers (`aria-live` off,
  visual-only animation).

## Responsiveness

Desktop-first, verified at 1440 / 1024 / 768 / 390:

- Split auth collapses to single pane (marketing panel hidden `<lg`).
- Dashboard reading row stacks; stat tiles go 2-up; subject grid 2→1 col.
- Quiz: rail stays sticky, tape ticks compress but keep 24px hit areas
  (horizontal scroll of the tape under 360px rather than shrinking targets);
  options full-width; kbd hints hidden on touch.
- Admin rows stack their meta under the name below `sm` (as today, re-lit).

## Performance

- framer-motion (~32 KB gz) + lucide (tree-shaken, ~1 KB per icon) are the
  only additions; no chart, confetti or particle libraries.
- Ambient layer is transform/opacity-only CSS on 3 fixed elements.
- Blur budget: ≤ 2 `backdrop-filter` surfaces per viewport.
- Staggers cap at 20 animated children; longer lists render instantly.
- `React.lazy` on `GenerationWorkspace` + admin pages (heaviest, rarely hit
  by students) — code-split at the route element, routing table untouched.
- Target: Lighthouse ≥ 90 performance, 100 a11y on Dashboard and Quiz.

---

## Implementation Roadmap

One page completed per phase, in this order, visual consistency enforced by
finishing the foundation first:

1. **Foundation** — tokens, `index.css`, Ambient, Motion, ui.tsx, Shell,
   Tape re-light, deps install. App must build and run identically skinned.
2. **Login + Register** (split landing decision applied here).
3. **Onboarding** (stepped experience).
4. **Dashboard** (observatory).
5. **Quiz** (focus mode + keyboard).
6. **Result + QuizReview** (reveal + analytics).
7. **Admin panel.**
8. **Generation workspace.**
9. **Polish pass** — responsive sweep, reduced-motion sweep, contrast
   check, Lighthouse, dead-style cleanup.

Each phase ends with `npm run build` + `npm run lint` green and a manual
walk of the affected flow.

---

## Risks

1. **Scope illusions** — several requested widgets (mastery radar, topic
   heatmap, AI suggestions, achievements, confidence selector, social
   login) require data or endpoints that don't exist; they are excluded
   here rather than faked. Each is a candidate future spec once its API
   exists.
2. **Behavior drift while re-skinning** — mitigated by the "hooks/handlers
   untouched" rule, per-phase manual flow walks, and diff review focused on
   JSX-only changes in pages.
3. **Contrast regressions on dark** — mitigated by the pre-verified token
   pairs; any new pair must be checked before use.
4. **backdrop-filter jank on low-end devices** — mitigated by the 2-surface
   blur budget and flat-translucency fallback.
5. **Route-state coupling** — Quiz and Result depend on `location.state`;
   page-transition wrapper must not remount `BrowserRouter` or alter state
   passing (it wraps `Routes` presentationally only).
6. **Bundle growth** — bounded to the two deps; route-level lazy splits the
   admin surface out of the student path.

---

## Definition of Done

- [ ] All 9 pages + guards re-skinned to this spec; no page left on the old
      theme.
- [ ] `npm run build` and `npm run lint` pass.
- [ ] Manual E2E walk: register → onboarding (all three modes) → quiz →
      result → review → logout → login; admin login → generate → accept /
      reject / more / chat / finish — all behave exactly as before.
- [ ] Network tab audit: identical request set and payload shapes on every
      flow, before vs after.
- [ ] Keyboard-only pass on quiz and onboarding.
- [ ] `prefers-reduced-motion` pass: no counters, bursts, transitions or
      ambient drift.
- [ ] 390px-wide pass on every page; no horizontal body scroll.
- [ ] Lighthouse ≥ 90 perf / 100 a11y on Dashboard and Quiz.
- [ ] Zero edits to `lib/api.ts`, `lib/quiz.ts`, `AuthContext.tsx` logic,
      guard logic, or any handler that builds a payload.
