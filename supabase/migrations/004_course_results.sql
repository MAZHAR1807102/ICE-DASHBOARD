-- 004: Course results — one row per student, course and semester, published by the exam office.
--
-- * Grade points follow the UGC uniform grading scale (A+ = 4.00 … D = 2.00, F = 0.00).
-- * master_students.cgpa and master_students.backlogs are recalculated automatically
--   whenever results change, from each course's latest attempt.
-- * Students can read only their own results; exam staff and the HOD publish them.
--
-- Run after 001. Runs as one transaction: if any statement fails, nothing is changed.

begin;

create table public.course_results (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.master_students(id) on delete restrict,
  semester          integer not null check (semester between 1 and 8),
  course_code       text not null,
  course_name       text,
  credit            numeric(3, 1) not null check (credit > 0),
  grade             text not null check (grade in ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F')),
  grade_point       numeric(3, 2) generated always as (
                      case grade
                        when 'A+' then 4.00 when 'A'  then 3.75 when 'A-' then 3.50
                        when 'B+' then 3.25 when 'B'  then 3.00 when 'B-' then 2.75
                        when 'C+' then 2.50 when 'C'  then 2.25 when 'D'  then 2.00
                        else 0.00
                      end
                    ) stored,
  published_by_name text,
  published_at      timestamptz not null default now(),

  unique (student_id, semester, course_code)
);

create index course_results_student_idx on public.course_results (student_id, semester);

-- Stamp who published / last changed the result.
create or replace function public.course_results_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.published_by_name := coalesce(auth.jwt() -> 'app_metadata' ->> 'name', auth.jwt() ->> 'email');
  end if;
  new.published_at := now();
  return new;
end $$;

-- CGPA and backlogs from each course's latest attempt (a retake replaces the earlier grade).
create or replace function public.refresh_academic_standing(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update master_students s set
    cgpa = coalesce(r.cgpa, 0),
    backlogs = coalesce(r.backlogs, 0)
  from (
    select round(sum(grade_point * credit) / nullif(sum(credit), 0), 2) as cgpa,
           count(*) filter (where grade = 'F') as backlogs
    from (
      select distinct on (course_code) grade, grade_point, credit
      from course_results
      where student_id = p_student
      order by course_code, semester desc
    ) latest
  ) r
  where s.id = p_student;
end $$;

create or replace function public.course_results_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_academic_standing(old.student_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_academic_standing(new.student_id);
  end if;
  return null;
end $$;

create trigger course_results_stamp before insert or update on public.course_results
  for each row execute function public.course_results_stamp();
create trigger course_results_refresh after insert or update or delete on public.course_results
  for each row execute function public.course_results_after_change();

revoke execute on function public.refresh_academic_standing(uuid) from public, anon, authenticated;

-- ---------- Who can see and publish results ----------
alter table public.course_results enable row level security;

create policy "faculty read results" on public.course_results
  for select to authenticated using (public.is_faculty());
create policy "student reads own results" on public.course_results
  for select to authenticated using (public.app_role() = 'student' and student_id::text = public.app_student_id());
create policy "exam office publishes results" on public.course_results
  for all to authenticated
  using (public.is_faculty('hod', 'exam'))
  with check (public.is_faculty('hod', 'exam'));

commit;
