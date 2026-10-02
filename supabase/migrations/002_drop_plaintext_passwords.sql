-- 002: Remove the old plain-text password columns.
--
-- Run ONLY after you've confirmed faculty and students can log in through the new
-- Supabase Auth flow. This permanently deletes the old passwords (they are no longer used).

begin;

alter table public.faculty_users drop column if exists password;
alter table public.master_students drop column if exists student_password;

commit;
