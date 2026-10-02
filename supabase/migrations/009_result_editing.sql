-- 009: Edit individual results after publishing — with a permanent change history.
--
-- * result_changes records every insert / update / delete on course_results and semester_results:
--   who, when, before → after, and the reason given. Nobody can edit or delete this history.
-- * Single-result edits go through functions that require a reason:
--   save_course_result, delete_course_result, save_semester_result, delete_semester_result.
-- * Bulk publishing is recorded too (reason "Published from a result sheet").
-- * CGPA / credits / backlogs keep recalculating automatically (existing triggers).
--
-- Run after 008. Runs as one transaction: if any statement fails, nothing is changed.

begin;

create table public.result_changes (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null,
  semester        integer,
  table_name      text not null,
  action          text not null check (action in ('insert', 'update', 'delete')),
  before          jsonb,
  after           jsonb,
  reason          text,
  changed_by_name text,
  changed_at      timestamptz not null default now()
);
create index result_changes_student_idx on public.result_changes (student_id, changed_at desc);

alter table public.result_changes enable row level security;
create policy "faculty read result history" on public.result_changes
  for select to authenticated using (public.is_faculty());
revoke insert, update, delete, truncate on public.result_changes from anon, authenticated;

create or replace function public.audit_result_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into result_changes (student_id, semester, table_name, action, before, after, reason, changed_by_name)
  values (
    (v_row ->> 'student_id')::uuid,
    (v_row ->> 'semester')::integer,
    tg_table_name,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    nullif(current_setting('app.change_reason', true), ''),
    coalesce(auth.jwt() -> 'app_metadata' ->> 'name', auth.jwt() ->> 'email')
  );
  return null;
end $$;

create trigger course_results_audit after insert or update or delete on public.course_results
  for each row execute function public.audit_result_change();
create trigger semester_results_audit after insert or update or delete on public.semester_results
  for each row execute function public.audit_result_change();

-- ---------- Single-result edits (reason required) ----------
create or replace function public.require_reason(p_reason text)
returns void language plpgsql as $$
begin
  if not public.is_faculty('hod', 'exam') then
    raise exception 'Only the exam office can change results.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Please give a reason for this change.';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
end $$;

-- p_id null = add a new course result.
create or replace function public.save_course_result(
  p_id uuid, p_student_id uuid, p_semester integer, p_exam_key text, p_course_code text,
  p_course_name text, p_credit numeric, p_grade text, p_reason text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_reason(p_reason);
  if p_id is null then
    insert into course_results (student_id, semester, exam_key, course_code, course_name, credit, grade)
    values (p_student_id, p_semester, coalesce(p_exam_key, ''), upper(trim(p_course_code)), nullif(trim(p_course_name), ''), p_credit, upper(p_grade))
    returning id into v_id;
  else
    update course_results set
      semester = p_semester, course_code = upper(trim(p_course_code)), course_name = nullif(trim(p_course_name), ''),
      credit = p_credit, grade = upper(p_grade)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'That result no longer exists.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_course_result(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_reason(p_reason);
  delete from course_results where id = p_id;
end $$;

create or replace function public.save_semester_result(
  p_id uuid, p_student_id uuid, p_semester integer, p_exam_key text, p_exam_title text,
  p_earned_credits numeric, p_gpa numeric, p_year_earned_credits numeric, p_ygpa numeric,
  p_result_status text, p_merit_position integer, p_reason text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_reason(p_reason);
  if p_id is null then
    insert into semester_results (student_id, semester, exam_key, exam_title, earned_credits, gpa, year_earned_credits, ygpa, result_status, merit_position)
    values (p_student_id, p_semester, coalesce(p_exam_key, ''), p_exam_title, p_earned_credits, p_gpa, p_year_earned_credits, p_ygpa, nullif(trim(p_result_status), ''), p_merit_position)
    returning id into v_id;
  else
    update semester_results set
      exam_title = p_exam_title, earned_credits = p_earned_credits, gpa = p_gpa,
      year_earned_credits = p_year_earned_credits, ygpa = p_ygpa,
      result_status = nullif(trim(p_result_status), ''), merit_position = p_merit_position
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'That result no longer exists.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_semester_result(p_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_reason(p_reason);
  delete from semester_results where id = p_id;
end $$;

-- Bulk publishing is labelled in the history too.
create or replace function public.publish_results(p_courses jsonb, p_summaries jsonb default '[]'::jsonb)
returns json language plpgsql security invoker set search_path = public as $$
declare
  v_courses integer;
  v_summaries integer;
begin
  if not public.is_faculty('hod', 'exam') then
    raise exception 'Only the exam office can publish results.';
  end if;
  perform set_config('app.change_reason', 'Published from a result sheet', true);

  insert into course_results (student_id, semester, exam_key, course_code, course_name, credit, grade)
  select distinct on (student_id, semester, course_code, exam_key)
         student_id, semester, coalesce(exam_key, ''), course_code, course_name, credit, upper(grade)
  from jsonb_to_recordset(coalesce(p_courses, '[]'::jsonb))
       as x(student_id uuid, semester integer, exam_key text, course_code text, course_name text, credit numeric, grade text)
  order by student_id, semester, course_code, exam_key,
           case upper(grade) when 'A+' then 4.00 when 'A' then 3.75 when 'A-' then 3.50 when 'B+' then 3.25 when 'B' then 3.00
                             when 'B-' then 2.75 when 'C+' then 2.50 when 'C' then 2.25 when 'D' then 2.00 else 0 end desc
  on conflict (student_id, semester, course_code, exam_key)
  do update set course_name = excluded.course_name, credit = excluded.credit, grade = excluded.grade;
  get diagnostics v_courses = row_count;

  insert into semester_results (student_id, semester, exam_key, exam_title, earned_credits, gpa,
                                year_earned_credits, ygpa, result_status, merit_position)
  select distinct on (student_id, semester, exam_key)
         student_id, semester, coalesce(exam_key, ''), exam_title, earned_credits, gpa,
         year_earned_credits, ygpa, result_status, merit_position
  from jsonb_to_recordset(coalesce(p_summaries, '[]'::jsonb))
       as x(student_id uuid, semester integer, exam_key text, exam_title text, earned_credits numeric, gpa numeric,
            year_earned_credits numeric, ygpa numeric, result_status text, merit_position integer)
  order by student_id, semester, exam_key, (gpa is null), gpa desc
  on conflict (student_id, semester, exam_key)
  do update set exam_title = excluded.exam_title, earned_credits = excluded.earned_credits, gpa = excluded.gpa,
                year_earned_credits = excluded.year_earned_credits, ygpa = excluded.ygpa,
                result_status = excluded.result_status, merit_position = excluded.merit_position;
  get diagnostics v_summaries = row_count;

  return json_build_object('courses', v_courses, 'summaries', v_summaries);
end $$;

-- Removing or renaming a whole sheet from "Published results" (reason recorded as well).
create or replace function public.remove_publication(p_semester integer, p_exam_key text, p_reason text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_reason(p_reason);
  delete from semester_results where semester = p_semester and exam_key = p_exam_key;
  delete from course_results where semester = p_semester and exam_key = p_exam_key;
end $$;

create or replace function public.rename_published_course(p_semester integer, p_exam_key text, p_from text, p_to text, p_reason text)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_count integer;
begin
  perform public.require_reason(p_reason);
  update course_results set course_code = upper(trim(p_to))
  where semester = p_semester and exam_key = p_exam_key and course_code = p_from;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.require_reason(text) from public, anon;
grant execute on function public.require_reason(text) to authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'save_course_result(uuid, uuid, integer, text, text, text, numeric, text, text)',
    'delete_course_result(uuid, text)',
    'save_semester_result(uuid, uuid, integer, text, text, numeric, numeric, numeric, numeric, text, integer, text)',
    'delete_semester_result(uuid, text)',
    'remove_publication(integer, text, text)',
    'rename_published_course(integer, text, text, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
