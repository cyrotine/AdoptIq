# Spec 02 — Authentication

**Feature Number:** 02
**Feature Title:** Authentication
**Feature Slug:** authentication
**Branch:** main
**Status:** Draft — awaiting approval
**Depends on:** Spec 01 (Database Schema) — `students` table live in Supabase.

---

## Overview

Stand up the AdaptIQ **backend** for the first time and deliver student
**registration** and **login** with JWT-based sessions. This is the first
running server in the project: it establishes the `Route → Controller →
Service → DB` skeleton (per CLAUDE.md) that every later feature reuses.

Auth writes to the existing `students` table only — **no schema change**.
Passwords are bcrypt-hashed; sessions are stateless JWTs signed with a
server-only secret. A minimal React login/register UI calls these endpoints.

---

## User Story

As a **student**, I can register with my details and log in, so that the
platform recognizes me and can attach my quizzes and progress to my account.

- Given valid, unique details, when I register, then my account is created and
  I receive a session token.
- Given correct credentials, when I log in, then I receive a session token.
- Given a valid token, when I call a protected route, then it returns my identity.

---

## Functional Requirements

1. **Register** — accept `name`, `username`, `email`, `password`, `class`;
   validate on the backend; reject duplicates (username/email); hash the
   password; create the student; return a JWT + safe user object.
2. **Login** — accept an `identifier` (username **or** email) + `password`;
   verify against the hash; return a JWT + safe user object.
3. **Session** — a protected `GET /api/auth/me` returns the current student
   from a valid `Authorization: Bearer <token>` header.
4. **Never** return `password_hash` or accept a client-supplied
   `student_id`/`total_quizzes`/`correct_answers`.
5. All validation runs server-side regardless of any client checks.

---

## Database Changes

**None.** Uses the existing `students` table from Spec 01:
`student_id` (uuid, default), `name`, `username` (unique), `email` (unique),
`password_hash`, `class` (CHECK 9/10), `total_quizzes`/`correct_answers`
(default 0). Uniqueness is already enforced by the DB.

---

## Backend Changes

First backend code in the repo. New structure under `backend/`:

```
backend/
  server.js              # express app entry: json, cors, mount /api, start listen
  routes/auth.routes.js  # POST /register, POST /login, GET /me
  controllers/auth.controller.js  # req/res only: parse, call service, shape response
  services/auth.service.js        # business logic: validate, hash, verify, sign, DB
  middleware/auth.middleware.js    # verify Bearer JWT -> req.student
  middleware/validate.js           # small manual field validators (no new dep)
  utils/jwt.js                     # sign/verify helpers around JWT_SECRET
db/supabase.js           # reuse existing service_role client
```

Rules:
- Controllers hold **no** business logic; services hold **all** of it.
- Services use the existing `db/supabase.js` client (service_role) for
  `students` reads/writes.
- Duplicate registration → catch Postgres unique violation (`23505`) → return
  `409 Conflict` (don't leak which field to a generic client, but a clear
  message is fine for MVP).

New dependencies (minimal): `express`, `cors`, `bcryptjs`, `jsonwebtoken`.
Hand-rolled validation — **no** validation library added.

New `package.json` scripts: `"dev": "node backend/server.js"` (or nodemon if present).

### Validation rules (server-side)
- `name`: non-empty, ≤ 100 chars.
- `username`: 3–30 chars, `[a-zA-Z0-9_]`.
- `email`: basic RFC-ish regex, ≤ 100 chars.
- `password`: ≥ 8 chars (hash with bcrypt, cost 10).
- `class`: integer in `{9, 10}`.
- `identifier` (login): non-empty; matched against username OR email.

---

## API Changes

Base path `/api/auth`. All bodies/response JSON.

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/register` | none | `{name, username, email, password, class}` | `201 {token, student}` | 400 validation, 409 duplicate |
| POST | `/login` | none | `{identifier, password}` | `200 {token, student}` | 400 validation, 401 bad creds |
| GET | `/me` | Bearer | — | `200 {student}` | 401 missing/invalid token |

`student` (safe shape, **never** includes `password_hash`):
```json
{ "student_id": "uuid", "name": "...", "username": "...", "email": "...",
  "class": 9, "total_quizzes": 0, "correct_answers": 0 }
```

`token`: JWT signed with `JWT_SECRET`, payload `{ sub: student_id }`, `expiresIn: 7d`.

Consistent error shape: `{ "error": "message" }`.

---

## Frontend Changes

No frontend exists yet, so this spec also scaffolds the React app (Vite + React
+ TypeScript + Tailwind) under `frontend/`, kept minimal:

```
frontend/
  src/
    lib/api.ts            # fetch wrapper: base URL + Bearer header from stored token
    context/AuthContext.tsx  # token + student state, login/register/logout, persist token
    pages/Register.tsx    # form -> POST /register
    pages/Login.tsx       # form -> POST /login
    components/ProtectedRoute.tsx
    App.tsx / main.tsx / routing
```

- Store JWT in `localStorage`; attach as `Authorization: Bearer` on requests.
- Each page has **loading / error / empty** states (per CLAUDE.md frontend rules).
- Client validation is UX-only; the backend re-validates everything.

> Scope note: if you'd rather ship backend-only first and build the UI in a
> follow-up, the frontend section can be split into Spec 02b. Default here is
> both, minimal.

---

## AI Changes

None.

## RL Changes

None.

## Supabase Changes

- None to schema. Backend authenticates using the **service_role** key already
  in `.env` (server-only). RLS is not relied upon — the service_role client is
  the trust boundary, and all access goes through validated services.
- `.env` / `.env.example` gain **`JWT_SECRET`** (server-only, never committed;
  `.env` is already gitignored).

---

## Data Flow

**Register**
```
Client -> POST /api/auth/register
  route -> controller (parse body)
    -> service: validate -> bcrypt.hash(password)
       -> supabase.insert(students, {..., password_hash})
          -> on 23505 unique violation => 409
       -> jwt.sign({sub: student_id})
    <- {token, student(safe)}
```

**Login**
```
Client -> POST /api/auth/login {identifier, password}
  -> service: fetch student by username OR email
     -> bcrypt.compare(password, password_hash)  (fail => 401, same message either way)
     -> jwt.sign -> {token, student(safe)}
```

**Protected**
```
Client -> GET /api/auth/me  (Authorization: Bearer <token>)
  -> auth.middleware: jwt.verify -> req.student = {student_id}
     -> service: fetch student by id -> {student(safe)}
```

---

## Risks

1. **JWT_SECRET management.** A weak/committed secret breaks all sessions.
   Mitigate: long random secret in `.env` only; document rotation invalidates
   existing tokens.
2. **localStorage token = XSS exposure.** Acceptable for MVP; note httpOnly
   cookie as the hardening path (deferred). Keep the frontend dependency-light
   to shrink XSS surface.
3. **Service_role on the backend.** Full DB power bypasses RLS — every write
   must go through validated services; never expose this key or proxy raw
   queries from the client.
4. **Duplicate-message leakage.** 409 telling *which* field is taken aids
   enumeration. MVP accepts a clear message; tighten later if needed.
5. **No rate limiting.** Login is brute-forceable. Out of scope for MVP; flag
   for a later hardening spec.
6. **bcryptjs (pure JS) is slower than native bcrypt.** Chosen for zero build
   hassle; fine at MVP scale.

---

## Definition of Done

- [ ] `backend/` runs (`npm run dev`) and serves `/api/auth/*`.
- [ ] `POST /register` creates a student with a bcrypt hash; returns `201 {token, student}` with **no** `password_hash`.
- [ ] Duplicate username/email returns `409`.
- [ ] `POST /login` returns `200 {token, student}` for correct creds; `401` otherwise (same message for bad user vs bad password).
- [ ] `GET /me` returns the student for a valid Bearer token; `401` without/with a bad token.
- [ ] All validation enforced server-side; invalid input returns `400`.
- [ ] `JWT_SECRET` present in `.env` + `.env.example`; no secrets committed.
- [ ] Frontend Register + Login pages call the API, persist the token, and gate a protected route (loading/error states present).
- [ ] End-to-end: register → land authenticated → reload → still authenticated → logout clears token.
```
