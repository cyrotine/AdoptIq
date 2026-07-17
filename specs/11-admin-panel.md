# Spec 11 — Admin Panel (UI shell + admin auth, Generate button deferred)

**Feature Number:** 11
**Feature Title:** Admin Panel
**Feature Slug:** admin-panel
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** 01-database-schema, 02-authentication
**Unblocks:** 10-ai-question-generator (gives it the admin-only surface Risk #2 asked for)

---

## Overview

The platform has students and nothing else — JWT carries only a `student_id`,
and there is no notion of an administrator. This spec introduces the first
admin-facing surface: a login-time role choice, a real (separately
authenticated) admin identity, and a single-page admin panel.

The panel shows **one** table: every topic ranked by how many times it has been
asked across all students, most-asked first, with a text filter to find a
topic. At the end sits a **Generate Test** button.

Scope boundary — this spec builds:
- The `Admin` / `Student` dropdown on the login page.
- A real admin account + admin login (separate `admins` table, role in the JWT,
  admin-gated routes). This is deliberately *not* a placeholder: spec 10's
  Risk #2 explicitly deferred building admin auth, and the AI question generator
  it drafts needs exactly this gate before its Generate action can ever be
  wired to an HTTP route.
- The admin panel page with a working, data-backed topics table + client-side
  filter.

This spec does **not** build:
- Any behaviour behind the **Generate Test** button. It renders and is a no-op
  (`onClick` does nothing) until a follow-up spec wires it to the spec-10
  `generateQuestions` pipeline behind an admin route.
- Admin self-service (signup, password reset, multiple roles beyond
  `admin`/`student`, per-admin permissions). One admin account, created via CLI.

Per CLAUDE.md's "never duplicate data" rule, the ask-count is **derived** at
read time by aggregating `quiz_responses → questions → topics` — never a stored
counter on `topics`.

---

## User Story

> As an AdaptIQ administrator, I want to log in as an admin (not a student),
> land on an admin panel, and see which topics students have been asked the
> most — so I can decide where the question bank needs more questions. I want to
> filter the list to a specific topic, and I want a Generate Test button in
> place for the next step, even though it does nothing yet.

---

## Functional Requirements

1. The login page gains a **role dropdown** with `Student` (default) and
   `Admin`. `Student` preserves today's exact behaviour and routes to `/`.
   `Admin` authenticates against the admin account and routes to `/admin`.
2. Admin authentication is **separate** from student auth: a distinct `admins`
   table, a distinct `POST /api/auth/admin/login` endpoint, and a `role` claim
   baked into the JWT. Admin passwords are bcrypt-hashed, exactly like students.
3. The `/admin` route is reachable **only** with an admin token. A student token
   (or no token) is redirected to `/login` client-side, and the admin API
   returns `401` server-side regardless of what the client renders.
4. The admin panel shows exactly **one** table: one row per topic, columns
   Topic (with its chapter/subject for context) and **Times Asked**, sorted by
   Times Asked **descending**. Topics never asked appear with a count of 0 at
   the bottom.
5. "Times Asked" for a topic = the number of `quiz_responses` rows whose
   question belongs to that topic, across all students. **Derived** via a
   Postgres aggregate function — never a stored column.
6. A **filter input** narrows the table to topics whose name matches the typed
   text (case-insensitive substring). Filtering is client-side over the already
   fetched rows — no re-query.
7. A **Generate Test** button renders at the end of the panel. In this spec its
   `onClick` is a no-op. No API call, no navigation, no side effect.
8. The panel has explicit loading, error, and empty states (CLAUDE.md frontend
   rule).
9. No change to any student-facing page or the student auth flow beyond the
   addition of the dropdown.

---

## Database Changes

New `admins` table and a read-only aggregate function, both non-destructive, in
`db/update.sql` and mirrored into `db/schema.sql`:

```sql
-- Spec 11: admin identity, separate from students. One row per administrator.
create table if not exists admins (
  admin_id      uuid primary key default gen_random_uuid(),
  username      varchar(30) not null unique,
  password_hash text not null,
  created_on    timestamptz not null default now()
);

grant all privileges on table admins to service_role;

-- Spec 11: times each topic has been asked, across all students. Derived from
-- quiz_responses -> questions -> topics; NOT a stored counter (CLAUDE.md rule).
-- LEFT JOINs so topics/questions with zero responses still appear (count 0).
create or replace function topic_ask_counts()
returns table (
  topic_id     integer,
  topic_name   text,
  chapter_name text,
  subject_name text,
  ask_count    bigint
)
language sql stable as $$
  select t.topic_id, t.topic_name, c.chapter_name, s.subject_name,
         count(qr.question_id) as ask_count
  from topics t
  join chapters c on c.chapter_id = t.chapter_id
  join subjects s on s.subject_id = c.subject_id
  left join questions q on q.topic_id = t.topic_id
  left join quiz_responses qr on qr.question_id = q.question_id
  group by t.topic_id, t.topic_name, c.chapter_name, s.subject_name
  order by ask_count desc, t.topic_name;
$$;
```

```
ponytail: full group-by scan over quiz_responses, no materialization. Fine at
current volume (few hundred responses). Turn it into a materialized view or add
a covering index only once the scan shows up in query time — not before.
```

Design notes (honours "don't store derivable data"):
- `admins` is genuinely new information (a second class of actor), not derivable
  from any existing table. Kept separate from `students` rather than adding a
  `role` column so the two never share a namespace — a student row can never
  become an admin by flipping a bit, and the `students` table stays exactly as
  spec 01 defined it.
- `topic_ask_counts()` stores nothing. No counter column is added to `topics`.

---

## Backend Changes

- **`backend/utils/jwt.js`** — extend the token to carry a role:
  - `sign(subject, role = 'student')` → payload `{ sub, role }` (student calls
    are unchanged since `role` defaults to `'student'`).
  - `verify(token)` returns the decoded `{ sub, role }` payload (or `null`),
    instead of just `sub`. One-line change at each of the two call sites below.
- **`backend/middleware/auth.middleware.js`** — `requireAuth` reads
  `payload.sub` into `req.studentId` as before (unchanged behaviour for
  students). Add **`requireAdmin`**: verifies the token and rejects with `401`
  unless `payload.role === 'admin'`; sets `req.adminId = payload.sub`.
- **`backend/services/auth.service.js`** — add `adminLogin({ username, password })`:
  look up `admins` by username, bcrypt-compare, and on success return
  `{ token: jwt.sign(admin_id, 'admin'), admin: { admin_id, username } }`. Same
  no-enumeration behaviour as student login (one message for unknown
  user / wrong password). Never selects or returns `password_hash`.
- **`backend/controllers/auth.controller.js`** — add `adminLogin` controller
  (parse → service → send), mirroring `login`.
- **`backend/routes/auth.routes.js`** — `POST /admin/login` → `adminLogin`.
- **`backend/services/admin.service.js`** (new) — `topicAskCounts()`: calls
  `supabase.rpc('topic_ask_counts')` and returns `{ status: 200, body: { topics } }`.
  The only new service; read-only, no writes.
- **`backend/controllers/admin.controller.js`** (new) — `topicStats` controller.
- **`backend/routes/admin.routes.js`** (new) — `GET /topic-stats` behind
  `requireAdmin`.
- **`backend/server.js`** — `app.use('/api/admin', adminRoutes)`.
- **`backend/scripts/createAdmin.js`** (new) — CLI to create the admin account
  (mirrors `db/test-connection.js` / spec-10's script pattern):
  `node backend/scripts/createAdmin.js --username <u> --password <p>`. Hashes the
  password with bcrypt and inserts one `admins` row. This is the only way an
  admin comes into existence in this spec — no signup endpoint.
- **Validation** — reuse the existing `validateLogin({ identifier, password })`
  for the admin login body (username passed as `identifier`); no new validator
  needed.

## Frontend Changes

- **`frontend/src/lib/api.ts`** — add an `Admin` interface (`admin_id`,
  `username`), an `AdminAuthResponse` (`token`, `admin`), and persist the role
  alongside the token (`adaptiq_role` in localStorage) so a cold reload knows
  which identity to restore.
- **`frontend/src/context/AuthContext.tsx`** — add `admin: Admin | null` and
  `adminLogin(username, password)`. On first-load restore, branch on the stored
  role: `admin` → `GET /api/auth/admin/me`-style restore (see API note below);
  otherwise the existing student `/api/auth/me` path. `logout()` clears both.
- **`frontend/src/pages/Login.tsx`** — add the `Student`/`Admin` `<select>`.
  On submit, branch: student → existing `login()` then `navigate('/')`; admin →
  `adminLogin()` then `navigate('/admin')`. Reuses the existing `AuthCard`/`Field`
  layout.
- **`frontend/src/components/AdminRoute.tsx`** (new) — mirrors `ProtectedRoute`
  but gates on `admin` instead of `student`; redirects to `/login` otherwise.
- **`frontend/src/pages/AdminPanel.tsx`** (new) — fetches
  `GET /api/admin/topic-stats`, renders the single ranked table with loading /
  error / empty states, a controlled filter `<input>` (client-side
  substring match on topic name), and the no-op **Generate Test** button
  (`// spec 11: wired to spec-10 generator in a follow-up`).
- **`frontend/src/App.tsx`** — add an admin-gated route group:
  `<Route element={<AdminRoute />}><Route path="/admin" element={<AdminPanel />} /></Route>`.

## API Changes

- **`POST /api/auth/admin/login`** — body `{ username, password }` →
  `{ token, admin }` on success, `401 { error: 'invalid credentials' }`
  otherwise. Token's `role` claim is `admin`.
- **`GET /api/auth/admin/me`** — behind `requireAdmin`; returns
  `{ admin: { admin_id, username } }` for session restore. (Symmetric with the
  existing student `GET /api/auth/me`.)
- **`GET /api/admin/topic-stats`** — behind `requireAdmin`; returns
  `{ topics: [{ topic_id, topic_name, chapter_name, subject_name, ask_count }] }`,
  already sorted most-asked first.
- No student-facing route changes.

## AI Changes

None. This spec builds the admin surface that spec 10's generator will later
plug into, but wires no AI in itself.

## RL Changes

None.

## Supabase Changes

Run the `db/update.sql` spec-11 section once: creates `admins` and the
`topic_ask_counts()` function. Non-destructive. Then run
`backend/scripts/createAdmin.js` once to create the initial admin account.

## Data Flow

```
(login)
Login page dropdown = Admin
  -> AuthContext.adminLogin(username, password)
  -> POST /api/auth/admin/login
  -> auth.service.adminLogin(): bcrypt compare vs admins row
  -> jwt.sign(admin_id, 'admin')  ->  { token(role=admin), admin }
  -> store token + role, navigate('/admin')

(cold reload)
stored role = admin
  -> GET /api/auth/admin/me (requireAdmin)  ->  restore admin | clear on 401

(admin panel)
AdminRoute: admin present ? render : redirect /login
AdminPanel mount
  -> GET /api/admin/topic-stats (requireAdmin)
  -> admin.service.topicAskCounts()
  -> supabase.rpc('topic_ask_counts')  [quiz_responses -> questions -> topics]
  -> render table, sorted desc
  -> filter input: client-side substring match (no re-query)
  -> Generate Test button: onClick = no-op  (wired in a follow-up spec)
```

---

## Risks

1. **Generate Test is a deliberate no-op.** The button exists but does nothing.
   When it is wired (follow-up, to spec 10's `generateQuestions`), the action
   must go through an **admin-gated** route — never a student-reachable one, per
   spec 10 Risk #2. This spec having built `requireAdmin` is what makes that
   safe later.
2. **Single shared admin account.** No per-admin identity, roles, or audit
   trail beyond `admin`/`student`. Acceptable for a one-operator platform;
   promote to real RBAC when there is more than one administrator.
3. **Admins created via CLI only.** No signup/reset UI. If the password is lost,
   re-run `createAdmin.js` (or delete/re-insert the row). Acceptable at this
   scale.
4. **JWT payload shape change.** Tokens now carry `role`. Student tokens issued
   before deploy have no `role` claim and read as `undefined` → treated as
   student (correct). They expire within 7 days regardless. `requireAdmin`
   fails closed: no explicit `role === 'admin'` ⇒ rejected.
5. **`topic_ask_counts()` is a full group-by scan.** Fine at current volume;
   ponytail comment in the migration names the upgrade path (materialized view /
   covering index) for when it isn't.
6. **Client-side route gating is not the security boundary.** `AdminRoute` only
   controls what renders; the real gate is `requireAdmin` on the API. Even if a
   student forced their way to `/admin`, `topic-stats` returns `401` and the
   table stays empty.

---

## Definition of Done

- [ ] `admins` table and `topic_ask_counts()` exist in both `schema.sql` and
      `update.sql`; migration runs clean on Supabase; `createAdmin.js` inserts a
      working admin account.
- [ ] Login page shows the `Student`/`Admin` dropdown; `Student` behaves exactly
      as before and lands on `/`; `Admin` authenticates and lands on `/admin`.
- [ ] `POST /api/auth/admin/login` returns a role=`admin` token on valid
      credentials and `401` otherwise; `password_hash` never leaves the server.
- [ ] `/admin` is unreachable without an admin token: student/no token →
      redirected to `/login`, and `GET /api/admin/topic-stats` → `401`.
- [ ] Admin panel renders one table of topics sorted by Times Asked descending,
      with working loading / error / empty states; counts match a manual
      `quiz_responses → questions → topics` aggregation.
- [ ] Filter input narrows the table by topic name, client-side, with no
      re-query.
- [ ] Generate Test button renders and does nothing on click (no request, no
      navigation).
- [ ] No student-facing page or student auth behaviour changed apart from the
      login dropdown.

---

## Sources

- Existing student auth flow — `backend/services/auth.service.js`,
  `backend/utils/jwt.js`, `backend/middleware/auth.middleware.js`,
  `frontend/src/context/AuthContext.tsx`
- Aggregate-via-RPC pattern — spec 10 `match_chapter_chunks` (same
  `supabase.rpc(...)` shape)
- CLI-script trigger pattern — `db/test-connection.js`, spec 10 scripts
