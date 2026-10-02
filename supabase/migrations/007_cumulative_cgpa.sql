-- 007: Running CGPA across all semesters.
--
-- Rules (confirmed by the department; the F-as-0.00 rule reproduces every GPA on RU's own sheets):
-- * A failed course counts as 0.00 in the GPA/CGPA until a better attempt replaces it.
-- * Every attempt is kept (regular, retake, improvement). For each course the BEST grade counts.
-- * Students whose earlier results were never uploaded can have a starting point: "credits and
--   CGPA through semester N" (academic_opening). Semesters up to N then come from that figure;
--   uploaded course results for semesters after N are added on top.
-- * master_students.cgpa, credits_earned and backlogs are kept up to date automatically.
--
-- Run after 006. Runs as one transaction: if any statement fails, nothing is changed.

begin;

-- ---------- 1. Keep every attempt: one row per student, semester, course AND exam ----------
alter table public.course_results add column if not exists exam_key text not null default '';
alter table public.semester_results add column if not exists exam_key text not null default '';

-- Results already imported from a sheet belong to that sheet's exam.
update public.semester_results set exam_key = lower(trim(coalesce(exam_title, '')));
update public.course_results c set exam_key = s.exam_key
from public.semester_results s
where s.student_id = c.student_id and s.semester = c.semester and c.exam_key = '';

do $$
declare
  v_name text;
begin
  -- Drop the old one-attempt-only unique constraints, whatever they were named.
  for v_name in
    select conname from pg_constraint
    where conrelid in ('public.course_results'::regclass, 'public.semester_results'::regclass)
      and contype = 'u'
  loop
    execute format('alter table %s drop constraint %I',
      (select conrelid::regclass from pg_constraint where conname = v_name limit 1), v_name);
  end loop;
end $$;

alter table public.course_results
  add constraint course_results_attempt_key unique (student_id, semester, course_code, exam_key);
alter table public.semester_results
  add constraint semester_results_exam_key unique (student_id, semester, exam_key);

-- ---------- 2. Starting point for earlier semesters ----------
create table public.academic_opening (
  student_id        uuid primary key references public.master_students(id) on delete restrict,
  through_semester  integer not null check (through_semester between 1 and 8),
  credits           numeric(6, 2) not null check (credits >= 0),
  cgpa              numeric(4, 3) not null check (cgpa between 0 and 4),
  note              text,
  published_by_name text,
  published_at      timestamptz not null default now()
);

create trigger academic_opening_stamp before insert or update on public.academic_opening
  for each row execute function public.course_results_stamp();

alter table public.academic_opening enable row level security;
create policy "faculty read openings" on public.academic_opening
  for select to authenticated using (public.is_faculty());
create policy "student reads own opening" on public.academic_opening
  for select to authenticated using (public.app_role() = 'student' and student_id::text = public.app_student_id());
create policy "exam office manages openings" on public.academic_opening
  for all to authenticated
  using (public.is_faculty('hod', 'exam'))
  with check (public.is_faculty('hod', 'exam'));

-- ---------- 3. Standing: best attempt per course + starting point ----------
alter table public.master_students add column if not exists credits_earned numeric(6, 2) not null default 0;

create or replace function public.refresh_academic_standing(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_open academic_opening;
begin
  select * into v_open from academic_opening where student_id = p_student;

  update master_students s set
    cgpa = coalesce(r.cgpa, 0),
    credits_earned = coalesce(r.earned, 0),
    backlogs = coalesce(r.backlogs, 0)
  from (
    select
      round(
        (coalesce(sum(b.grade_point * b.credit), 0) + coalesce(v_open.cgpa * v_open.credits, 0))
        / nullif(coalesce(sum(b.credit), 0) + coalesce(v_open.credits, 0), 0), 3) as cgpa,
      coalesce(sum(b.credit) filter (where b.grade <> 'F'), 0) + coalesce(v_open.credits, 0) as earned,
      count(*) filter (where b.grade = 'F') as backlogs
    from (
      select distinct on (course_code) grade, grade_point, credit
      from course_results
      where student_id = p_student and semester > coalesce(v_open.through_semester, 0)
      order by course_code, grade_point desc, semester desc, published_at desc
    ) b
  ) r
  where s.id = p_student;
end $$;

create or replace function public.academic_opening_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_academic_standing(coalesce(new.student_id, old.student_id));
  return null;
end $$;

create trigger academic_opening_refresh after insert or update or delete on public.academic_opening
  for each row execute function public.academic_opening_after_change();

revoke execute on function public.refresh_academic_standing(uuid) from public, anon, authenticated;

-- Recalculate everyone under the new rules.
select public.refresh_academic_standing(id) from public.master_students;

commit;
