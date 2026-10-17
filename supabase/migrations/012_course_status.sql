-- 012: End a running course for the batch that took it.
--
-- * courses.status: 'running' or 'ended', with ended_at, ended_batch (the session it ran for, e.g.
--   "2024-25") and ended_by_name. Ending and reopening are plain updates by the academic office / HOD
--   (the existing "academic manages courses" policy).
-- * An ended course leaves the teacher portal, and its teacher can no longer change CT marks.
--   The academic office and HOD still can, and exam documents still list it.
--
-- Run after 011. Runs as one transaction: if any statement fails, nothing is changed.

begin;

alter table public.courses
  add column if not exists status text not null default 'running' check (status in ('running', 'ended')),
  add column if not exists ended_at timestamptz,
  add column if not exists ended_batch text,
  add column if not exists ended_by_name text;

-- Teachers work only on running courses; the academic office and HOD on any.
create or replace function public.can_enter_ct(p_course public.courses)
returns boolean language sql stable as $$
  select (p_course.status = 'running'
          and lower(coalesce(p_course.teacher_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '-')))
      or public.is_faculty('hod', 'academic')
$$;

-- The teacher portal lists running courses only.
create or replace function public.teacher_courses()
returns table (
  id uuid, semester integer, course_code varchar, course_name varchar, credit integer,
  student_count bigint, ct_saved_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.semester, c.course_code, c.course_name, c.credit,
         (select count(*) from master_students s where s.semester = c.semester and s.status = 'active'),
         c.ct_saved_at
  from courses c
  where c.status = 'running'
    and lower(coalesce(c.teacher_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '-'))
  order by c.semester, c.course_code
$$;

commit;
