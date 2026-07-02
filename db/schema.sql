-- AdaptIQ MVP schema. Run once against the Supabase project's Postgres database.

create table students (
  student_id       uuid primary key default gen_random_uuid(),
  name             text not null,
  username         text not null unique,
  email            text not null unique,
  password_hash    text not null,
  class            int not null,
  total_quizzes    int not null default 0,
  correct_answers  int not null default 0
);

create table subjects (
  subject_id    serial primary key,
  subject_name  text not null unique
);

create table chapters (
  chapter_id    serial primary key,
  chapter_name  text not null,
  class         int not null,
  subject_id    int not null references subjects(subject_id)
);

create table topics (
  topic_id    serial primary key,
  chapter_id  int not null references chapters(chapter_id),
  topic_name  text not null
);

create table questions (
  question_id       serial primary key,
  question_text     text not null,
  option_a          text not null,
  option_b          text not null,
  option_c          text not null,
  option_d          text not null,
  correct_answer    char(1) not null check (correct_answer in ('A','B','C','D')),
  explanation       text,
  topic_id          int not null references topics(topic_id),
  difficulty_label  text not null check (difficulty_label in ('Easy','Medium','Hard')),
  estimated_time    int
);

create table quiz_history (
  quiz_id           uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(student_id),
  subject           int not null references subjects(subject_id),
  easy_count        int not null default 0,
  medium_count      int not null default 0,
  hard_count        int not null default 0,
  correct_answers   int not null default 0,
  total_time_taken  int,
  completed_on      timestamptz not null default now()
);

create table quiz_responses (
  quiz_id         uuid not null references quiz_history(quiz_id),
  question_id     int not null references questions(question_id),
  student_answer  char(1) check (student_answer in ('A','B','C','D')),
  time_taken      int,
  primary key (quiz_id, question_id)
);

create index on chapters (subject_id);
create index on topics (chapter_id);
create index on questions (topic_id);
create index on quiz_history (student_id);
create index on quiz_responses (question_id);
