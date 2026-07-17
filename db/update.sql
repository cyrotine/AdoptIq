-- Spec 07: difficulty is now the question's frozen Elo (elo_question), and the
-- Easy/Medium/Hard band is derived from it at read time — never stored.
-- Run once against the Supabase Postgres database. Destructive: drops a column.
alter table questions drop column difficulty_label;              -- its CHECK drops with it
alter table questions rename column difficulty_score to elo_question;

-- Spec 08: per-topic student mastery Elo (0–100). A missing row reads as the
-- default 50, so we never store rows equal to the default. Seeded from the
-- post-registration proficiency probe; later updated by the Elo engine.
-- Run once. Safe to re-run (if not exists).
create table if not exists student_topic_mastery (
  student_id  uuid    not null references students(student_id) on delete cascade,
  topic_id    integer not null references topics(topic_id),
  elo         smallint not null default 50 check (elo between 0 and 100),
  attempts    integer not null default 0,
  updated_on  timestamp not null default now(),
  primary key (student_id, topic_id)
);
create index if not exists student_topic_mastery_student_idx
  on student_topic_mastery (student_id);

grant all privileges on table student_topic_mastery to service_role;

-- Spec 09: passive behavioural signals for the adaptive Elo engine. answer_changes
-- counts option switches before submit; position is the 1-based ordinal in the
-- quiz (for the fatigue discount). Non-destructive; safe to re-run.
alter table quiz_responses
  add column if not exists answer_changes smallint not null default 0,
  add column if not exists position       smallint;

-- Spec 11: admin identity, separate from students. One row per administrator.
-- Passwords bcrypt-hashed. Created via backend/scripts/createAdmin.js.
-- Non-destructive; safe to re-run.
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
-- ponytail: full group-by scan over quiz_responses, no materialization. Fine at
-- current volume. Promote to a materialized view / covering index only once the
-- scan shows up in query time — not before.
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
