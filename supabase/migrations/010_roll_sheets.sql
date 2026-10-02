-- 010: Roll sheets.
--
-- * Student details printed on RU roll sheets: Bangla name, mother's and father's names, and an
--   optional session override (normally worked out from the RU ID, e.g. 2538520… → 2024-25).
-- * roll_sheet_subjects: the full subject list of each semester's final exam (theory + labs),
--   edited and saved by the exam office, reused every time a roll sheet is generated.
--
-- Run after 009. Runs as one transaction: if any statement fails, nothing is changed.

begin;

alter table public.master_students
  add column if not exists name_bn     text,
  add column if not exists mother_name text,
  add column if not exists father_name text,
  add column if not exists session     text;

-- Staff edit students through column-level grants (migration 003); include the new columns.
grant insert (name_bn, mother_name, father_name, session),
      update (name_bn, mother_name, father_name, session)
  on public.master_students to authenticated;

create table public.roll_sheet_subjects (
  id          uuid primary key default gen_random_uuid(),
  semester    integer not null check (semester between 1 and 8),
  position    integer not null default 0,
  course_code text not null,
  title       text not null,
  credit      numeric(4, 2),
  is_theory   boolean not null default true,
  unique (semester, course_code)
);

alter table public.roll_sheet_subjects enable row level security;
create policy "faculty read roll sheet subjects" on public.roll_sheet_subjects
  for select to authenticated using (public.is_faculty());
create policy "exam office manages roll sheet subjects" on public.roll_sheet_subjects
  for all to authenticated
  using (public.is_faculty('hod', 'exam'))
  with check (public.is_faculty('hod', 'exam'));

commit;
