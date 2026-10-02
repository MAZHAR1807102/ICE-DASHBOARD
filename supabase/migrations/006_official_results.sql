-- 006: Official RU result sheets.
--
-- * course_results.credit allows two decimals (RU labs are often 0.75 or 1.5 credits).
-- * semester_results keeps the figures RU publishes for each student and semester:
--   earned credits (EC), GPA, yearly credits (YEC), yearly GPA (YGPA), Pass/Cond/Fail and merit.
-- * Students read only their own; exam staff and the HOD publish.
--
-- Run after 004. Runs as one transaction: if any statement fails, nothing is changed.

begin;

alter table public.course_results alter column credit type numeric(4, 2);

create table public.semester_results (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.master_students(id) on delete restrict,
  semester          integer not null check (semester between 1 and 8),
  exam_title        text,
  earned_credits    numeric(5, 2),
  gpa               numeric(4, 3),
  year_earned_credits numeric(5, 2),
  ygpa              numeric(4, 3),
  result_status     text,
  merit_position    integer,
  published_by_name text,
  published_at      timestamptz not null default now(),

  unique (student_id, semester)
);

create trigger semester_results_stamp before insert or update on public.semester_results
  for each row execute function public.course_results_stamp();

alter table public.semester_results enable row level security;

create policy "faculty read semester results" on public.semester_results
  for select to authenticated using (public.is_faculty());
create policy "student reads own semester results" on public.semester_results
  for select to authenticated using (public.app_role() = 'student' and student_id::text = public.app_student_id());
create policy "exam office publishes semester results" on public.semester_results
  for all to authenticated
  using (public.is_faculty('hod', 'exam'))
  with check (public.is_faculty('hod', 'exam'));

commit;
