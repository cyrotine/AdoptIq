-- Spec 07: difficulty is now the question's frozen Elo (elo_question), and the
-- Easy/Medium/Hard band is derived from it at read time — never stored.
-- Run once against the Supabase Postgres database. Destructive: drops a column.
alter table questions drop column difficulty_label;              -- its CHECK drops with it
alter table questions rename column difficulty_score to elo_question;
