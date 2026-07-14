-- AdaptIQ seed data (spec 01-database-schema).
-- Run after schema.sql. Proves the FK chain Question -> Topic -> Chapter -> Subject.
-- Serial IDs are resolved via subselects, so no IDs are hardcoded.
-- elo_question mapping: Easy=20 / Medium=50 / Hard=80.

insert into subjects (subject_name) values
  ('Maths'),
  ('Science');

insert into chapters (subject_id, class, chapter_name) values
  ((select subject_id from subjects where subject_name = 'Maths'), 9, 'Number Systems');

insert into topics (chapter_id, topic_name) values
  ((select chapter_id from chapters where chapter_name = 'Number Systems'), 'Rational Numbers');

insert into questions
  (question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, topic_id, elo_question, estimated_time)
values
  (
    'Which of the following is a rational number?',
    'sqrt(2)',
    '3/4',
    'pi',
    'sqrt(3)',
    'B',
    'A rational number can be written as p/q where p and q are integers and q != 0. 3/4 fits this form.',
    (select topic_id from topics where topic_name = 'Rational Numbers'),
    20,
    45
  );
