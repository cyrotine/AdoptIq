-- AdaptIQ MVP schema (spec 01-database-schema).
-- Run once against the Supabase project's Postgres database. Re-runnable: the
-- drops below let this file reapply cleanly on a fresh/reset DB.
-- gen_random_uuid() is built-in on Supabase; no extension needed.

drop table if exists student_topic_mastery cascade;
drop table if exists quiz_responses cascade;
drop table if exists quiz_history cascade;
drop table if exists questions cascade;
drop table if exists topics cascade;
drop table if exists chapters cascade;
drop table if exists subjects cascade;
drop table if exists admins cascade;
drop table if exists students cascade;

create table students (
  student_id       uuid primary key default gen_random_uuid(),
  name             varchar(100) not null,
  username         varchar(30) not null unique,
  email            varchar(100) not null unique,
  password_hash    text not null,
  class            smallint not null check (class in (9, 10)),
  total_quizzes    integer not null default 0,
  correct_answers  integer not null default 0
);

-- Administrators (spec 11). A second class of actor, kept fully separate from
-- students — a student row can never become an admin. Passwords bcrypt-hashed.
create table admins (
  admin_id      uuid primary key default gen_random_uuid(),
  username      varchar(30) not null unique,
  password_hash text not null,
  created_on    timestamptz not null default now()
);

create table subjects (
  subject_id    serial primary key,
  subject_name  varchar(50) not null unique
);

create table chapters (
  chapter_id    serial primary key,
  subject_id    integer not null references subjects(subject_id),
  class         smallint not null check (class in (9, 10)),
  chapter_name  varchar(150) not null
);

create table topics (
  topic_id    serial primary key,
  chapter_id  integer not null references chapters(chapter_id),
  topic_name  varchar(150) not null
);

create table questions (
  question_id       uuid primary key default gen_random_uuid(),
  question_text     text not null,
  option_a          text not null,
  option_b          text not null,
  option_c          text not null,
  option_d          text not null,
  correct_answer    char(1) not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanation       text,
  topic_id          integer not null references topics(topic_id),
  -- Question's frozen Elo (0–100). The Easy/Medium/Hard band is derived from it
  -- at read time (spec 07) — never stored. Frozen at creation.
  elo_question      smallint not null check (elo_question between 0 and 100),
  estimated_time    integer
);

create table quiz_history (
  quiz_id           uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(student_id),
  subject           varchar(20) not null,
  easy_questions    smallint not null default 0,
  medium_questions  smallint not null default 0,
  hard_questions    smallint not null default 0,
  correct_answers   smallint not null default 0,
  total_time_taken  integer,
  completed_on      timestamp not null default now()
);

create table quiz_responses (
  quiz_id         uuid not null references quiz_history(quiz_id),
  question_id     uuid not null references questions(question_id),
  student_answer  char(1) check (student_answer in ('A', 'B', 'C', 'D')),
  time_taken      integer,
  -- Passive behavioural signals for the Elo engine (spec 09). answer_changes:
  -- times the student switched option before submitting. position: 1-based
  -- ordinal in the quiz (the PK is unordered), used for the fatigue discount.
  answer_changes  smallint not null default 0,
  position        smallint,
  primary key (quiz_id, question_id)
);

-- Per-topic student mastery Elo (0–100), spec 08. A MISSING row reads as the
-- default 50, so rows equal to the default are never stored. Seeded from the
-- post-registration probe; later updated by the Elo engine.
create table student_topic_mastery (
  student_id  uuid    not null references students(student_id) on delete cascade,
  topic_id    integer not null references topics(topic_id),
  elo         smallint not null default 50 check (elo between 0 and 100),
  attempts    integer not null default 0,
  updated_on  timestamp not null default now(),
  primary key (student_id, topic_id)
);

create index on chapters (subject_id);
create index on topics (chapter_id);
create index on questions (topic_id);
create index on quiz_history (student_id);
create index on quiz_responses (question_id);
create index on student_topic_mastery (student_id);

-- =====================================================
-- Backend Permissions
-- =====================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- =====================================================
-- Admin read models (spec 11)
-- =====================================================

-- Times each topic has been asked, across all students. Derived from
-- quiz_responses -> questions -> topics; NOT a stored counter (CLAUDE.md rule).
-- LEFT JOINs so topics/questions with zero responses still appear (count 0).
-- ponytail: full group-by scan over quiz_responses, no materialization. Fine at
-- current volume (few hundred responses). Promote to a materialized view or add
-- a covering index only once the scan shows up in query time — not before.
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