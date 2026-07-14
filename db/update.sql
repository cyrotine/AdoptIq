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
