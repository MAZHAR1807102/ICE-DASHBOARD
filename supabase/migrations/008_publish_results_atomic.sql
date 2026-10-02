-- 008: Publish a result sheet in one all-or-nothing step.
--
-- publish_results(courses, summaries) saves the course grades and the official semester figures
-- together: if anything fails, nothing is saved (no more half-published sheets).
-- Rows repeated within one upload (e.g. an improvement sheet listing a student once per course)
-- are collapsed first — for a repeated course the better grade is kept.
--
-- Run after 007. Runs as one transaction: if any statement fails, nothing is changed.

begin;

create or replace function public.publish_results(p_courses jsonb, p_summaries jsonb default '[]'::jsonb)
returns json language plpgsql security invoker set search_path = public as $$
declare
  v_courses integer;
  v_summaries integer;
begin
  if not public.is_faculty('hod', 'exam') then
    raise exception 'Only the exam office can publish results.';
  end if;

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

revoke execute on function public.publish_results(jsonb, jsonb) from public, anon;
grant execute on function public.publish_results(jsonb, jsonb) to authenticated;

commit;
