-- 005: Teacher portal — course teachers enter CT marks for their own courses.
--
-- * A course belongs to whoever's email is in courses.teacher_email.
-- * Teachers never read the student tables directly. They go through three functions that
--   check ownership: teacher_courses(), teacher_roster(course) and save_ct_marks(course, marks).
-- * 3-credit courses have CT1–CT4 (max 15 each); 2-credit courses have CT1–CT3 (max 10 each).
-- * courses.ct_saved_at / ct_saved_by show the academic office who has submitted.
--
-- Run after 001. Runs as one transaction: if any statement fails, nothing is changed.

begin;

alter table public.courses
  add column if not exists ct_saved_at timestamptz,
  add column if not exists ct_saved_by text;

-- The signed-in user may work on this course: its teacher, or the academic office / HOD.
create or replace function public.can_enter_ct(p_course public.courses)
returns boolean language sql stable as $$
  select lower(coalesce(p_course.teacher_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '-'))
      or public.is_faculty('hod', 'academic')
$$;

-- Courses taught by the signed-in teacher, with how many students they have.
create or replace function public.teacher_courses()
returns table (
  id uuid, semester integer, course_code varchar, course_name varchar, credit integer,
  student_count bigint, ct_saved_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.semester, c.course_code, c.course_name, c.credit,
         (select count(*) from master_students s where s.semester = c.semester),
         c.ct_saved_at
  from courses c
  where lower(coalesce(c.teacher_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '-'))
  order by c.semester, c.course_code
$$;

-- Students of the course's semester with their current CT marks — only names and IDs.
create or replace function public.teacher_roster(p_course_id uuid)
returns table (
  student_id uuid, college_id varchar, ru_id varchar, name varchar,
  ct1 numeric, ct2 numeric, ct3 numeric, ct4 numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_course courses;
begin
  select * into v_course from courses where id = p_course_id;
  if not found or not public.can_enter_ct(v_course) then
    raise exception 'You are not the teacher of this course.';
  end if;

  return query
    select s.id, s.college_id, s.ru_id, s.name, m.ct1, m.ct2, m.ct3, m.ct4
    from master_students s
    left join ct_marks m on m.student_id = s.id and m.course_code = v_course.course_code
    where s.semester = v_course.semester
    order by s.college_id;
end $$;

-- Saves marks for many students at once: [{student_id, ct1, ct2, ct3, ct4}, ...].
-- Blank (null) means "not entered yet". All rows are saved, or none are.
create or replace function public.save_ct_marks(p_course_id uuid, p_marks jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_course courses;
  v_max    numeric;
  v_row    jsonb;
  v_student master_students;
  v_ct     numeric[];
  v_saved  integer := 0;
begin
  select * into v_course from courses where id = p_course_id;
  if not found or not public.can_enter_ct(v_course) then
    raise exception 'You are not the teacher of this course.';
  end if;
  v_max := case when v_course.credit = 2 then 10 else 15 end;

  for v_row in select * from jsonb_array_elements(coalesce(p_marks, '[]'::jsonb)) loop
    select * into v_student from master_students
    where id = (v_row ->> 'student_id')::uuid and semester = v_course.semester;
    if not found then
      raise exception 'A student in the list is not enrolled in semester % (%).', v_course.semester, v_course.course_code;
    end if;

    v_ct := array[
      nullif(v_row ->> 'ct1', '')::numeric,
      nullif(v_row ->> 'ct2', '')::numeric,
      nullif(v_row ->> 'ct3', '')::numeric,
      case when v_course.credit = 2 then null else nullif(v_row ->> 'ct4', '')::numeric end
    ];
    for i in 1..4 loop
      if v_ct[i] is not null and (v_ct[i] < 0 or v_ct[i] > v_max) then
        raise exception 'CT% for % (%) must be between 0 and %.', i, v_student.name, v_student.college_id, v_max;
      end if;
    end loop;

    insert into ct_marks (student_id, course_code, ct1, ct2, ct3, ct4)
    values (v_student.id, v_course.course_code, v_ct[1], v_ct[2], v_ct[3], v_ct[4])
    on conflict (student_id, course_code)
    do update set ct1 = excluded.ct1, ct2 = excluded.ct2, ct3 = excluded.ct3, ct4 = excluded.ct4;
    v_saved := v_saved + 1;
  end loop;

  update courses
  set ct_saved_at = now(),
      ct_saved_by = coalesce(auth.jwt() -> 'app_metadata' ->> 'name', auth.jwt() ->> 'email')
  where id = p_course_id;

  return v_saved;
end $$;

revoke execute on function public.teacher_courses() from public, anon;
revoke execute on function public.teacher_roster(uuid) from public, anon;
revoke execute on function public.save_ct_marks(uuid, jsonb) from public, anon;
grant execute on function public.teacher_courses() to authenticated;
grant execute on function public.teacher_roster(uuid) to authenticated;
grant execute on function public.save_ct_marks(uuid, jsonb) to authenticated;

commit;
