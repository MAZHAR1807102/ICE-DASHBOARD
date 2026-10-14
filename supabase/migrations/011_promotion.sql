-- 011: Promote students to the next semester after each exam — automatic suggestions, manual
-- exceptions, a permanent history, and undo.
--
-- * master_students.status: 'active' or 'graduated' (graduated_at set when they finish semester 8).
--   Only promote_students / undo_student_moves change it.
-- * student_moves records every promotion, hold-back and graduation: before → after, reason, who.
-- * promote_students(from_semester, moves) applies a whole batch in one step:
--     promote  → semester + 1
--     hold     → stays in the same semester (repeats it with the next batch, shown as Readd)
--     graduate → semester 8 only; status 'graduated'
--   Each starts the new term fresh: overall attendance 0, eligibility override off, exam
--   registration Pending. A student no longer in from_semester (e.g. already moved) is skipped,
--   so pressing the button twice can't move anyone two semesters.
-- * undo_student_moves(batch) puts a batch back, for students nobody has moved since.
-- * Teachers' course rosters leave graduated students out.
--
-- Run after 010. Runs as one transaction: if any statement fails, nothing is changed.

begin;

alter table public.master_students
  add column if not exists status text not null default 'active' check (status in ('active', 'graduated')),
  add column if not exists graduated_at timestamptz;
-- No insert/update grant on the new columns: they change only through the functions below.

create table public.student_moves (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null,
  student_id      uuid not null references public.master_students (id) on delete cascade,
  action          text not null check (action in ('promote', 'hold', 'graduate')),
  from_semester   integer not null,
  to_semester     integer not null,
  reason          text,
  before          jsonb not null, -- semester, status, attendance, override, exam registration
  moved_by_name   text,
  moved_at        timestamptz not null default now(),
  undone_at       timestamptz,
  undone_by_name  text
);
create index student_moves_batch_idx on public.student_moves (batch_id);
create index student_moves_student_idx on public.student_moves (student_id, moved_at desc);

alter table public.student_moves enable row level security;
create policy "faculty read student moves" on public.student_moves
  for select to authenticated using (public.is_faculty());
revoke insert, update, delete, truncate on public.student_moves from anon, authenticated;

create or replace function public.actor_name()
returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'name', auth.jwt() ->> 'email')
$$;

-- p_moves: [{ "student_id": "…", "action": "promote" | "hold" | "graduate", "reason": "…" }, …]
create or replace function public.promote_students(p_from_semester integer, p_moves jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch   uuid := gen_random_uuid();
  v_move    record;
  v_student master_students;
  v_to      integer;
  v_counts  jsonb := jsonb_build_object('promote', 0, 'hold', 0, 'graduate', 0, 'skipped', 0);
begin
  if not public.is_faculty('hod', 'academic') then
    raise exception 'Only the academic office can promote students.';
  end if;
  if p_from_semester is null or p_from_semester not between 1 and 8 then
    raise exception 'Choose a semester from 1 to 8.';
  end if;

  for v_move in
    select * from jsonb_to_recordset(coalesce(p_moves, '[]'::jsonb)) as x(student_id uuid, action text, reason text)
  loop
    if v_move.action not in ('promote', 'hold', 'graduate') then
      raise exception 'Unknown action "%".', v_move.action;
    end if;
    if v_move.action = 'promote' and p_from_semester = 8 then
      raise exception 'Semester 8 students graduate or are held back; they cannot be promoted.';
    end if;
    if v_move.action = 'graduate' and p_from_semester <> 8 then
      raise exception 'Only semester 8 students can graduate.';
    end if;

    select * into v_student from master_students where id = v_move.student_id for update;
    if not found or v_student.semester <> p_from_semester or v_student.status <> 'active' then
      v_counts := jsonb_set(v_counts, '{skipped}', to_jsonb((v_counts ->> 'skipped')::int + 1));
      continue;
    end if;

    v_to := case when v_move.action = 'promote' then p_from_semester + 1 else p_from_semester end;

    insert into student_moves (batch_id, student_id, action, from_semester, to_semester, reason, before, moved_by_name)
    values (
      v_batch, v_student.id, v_move.action, p_from_semester, v_to, nullif(trim(coalesce(v_move.reason, '')), ''),
      jsonb_build_object(
        'semester', v_student.semester, 'status', v_student.status,
        'attendance_percentage', v_student.attendance_percentage,
        'eligibility_override', v_student.eligibility_override,
        'exam_reg_status', v_student.exam_reg_status
      ),
      public.actor_name()
    );

    update master_students set
      semester = v_to,
      status = case when v_move.action = 'graduate' then 'graduated' else status end,
      graduated_at = case when v_move.action = 'graduate' then now() else graduated_at end,
      attendance_percentage = 0,
      eligibility_override = false,
      exam_reg_status = 'Pending'
    where id = v_student.id;

    v_counts := jsonb_set(v_counts, array[v_move.action], to_jsonb((v_counts ->> v_move.action)::int + 1));
  end loop;

  return v_counts || jsonb_build_object('batch_id', v_batch);
end $$;

-- Puts a batch back. Students moved again since (or edited to another semester) are left alone.
create or replace function public.undo_student_moves(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_move    student_moves;
  v_restored integer := 0;
  v_skipped  integer := 0;
begin
  if not public.is_faculty('hod', 'academic') then
    raise exception 'Only the academic office can undo a promotion.';
  end if;

  for v_move in select * from student_moves where batch_id = p_batch and undone_at is null for update loop
    if exists (
      select 1 from student_moves later
      where later.student_id = v_move.student_id and later.moved_at > v_move.moved_at and later.undone_at is null
    ) or not exists (
      select 1 from master_students s
      where s.id = v_move.student_id and s.semester = v_move.to_semester
        and s.status = case when v_move.action = 'graduate' then 'graduated' else 'active' end
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update master_students set
      semester = (v_move.before ->> 'semester')::integer,
      status = v_move.before ->> 'status',
      graduated_at = case when v_move.action = 'graduate' then null else graduated_at end,
      attendance_percentage = (v_move.before ->> 'attendance_percentage')::integer,
      eligibility_override = (v_move.before ->> 'eligibility_override')::boolean,
      exam_reg_status = v_move.before ->> 'exam_reg_status'
    where id = v_move.student_id;

    update student_moves set undone_at = now(), undone_by_name = public.actor_name() where id = v_move.id;
    v_restored := v_restored + 1;
  end loop;

  return jsonb_build_object('restored', v_restored, 'skipped', v_skipped);
end $$;

revoke execute on function public.promote_students(integer, jsonb) from public, anon;
revoke execute on function public.undo_student_moves(uuid) from public, anon;
grant execute on function public.promote_students(integer, jsonb) to authenticated;
grant execute on function public.undo_student_moves(uuid) to authenticated;

-- ---------- Teachers' rosters: active students only ----------
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
  where lower(coalesce(c.teacher_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '-'))
  order by c.semester, c.course_code
$$;

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
    where s.semester = v_course.semester and s.status = 'active'
    order by s.college_id;
end $$;

commit;
