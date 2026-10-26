-- 013: A list of course teachers.
--
-- * teachers: everyone who teaches (or has taught) a course — name, designation, department, phone,
--   email. One row per email. Courses keep their own teacher_name / teacher_email; the Academic
--   office picks teachers from this list when assigning courses.
-- * Filled from every teacher already on a course (one row per email, the name used most often),
--   then from the department's "Course Instructors" sheet (designations and phone numbers).
-- * From now on, whoever is put on a course (added or edited, from any screen) joins the list
--   automatically if they are not on it yet.
--
-- Run after 012. Runs as one transaction: if any statement fails, nothing is changed.

begin;

create table public.teachers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  email        text,
  phone        text,
  designation  text,
  department   text default 'Dept. of CSE, ICE',
  notes        text,
  created_at   timestamptz not null default now()
);
create unique index teachers_email_key on public.teachers (lower(email)) where email is not null and email <> '';

alter table public.teachers enable row level security;
create policy "faculty read teachers" on public.teachers
  for select to authenticated using (public.is_faculty());
create policy "academic manages teachers" on public.teachers
  for all to authenticated
  using (public.is_faculty('hod', 'academic'))
  with check (public.is_faculty('hod', 'academic'));

-- Everyone already teaching a course.
insert into public.teachers (name, email)
select distinct on (lower(email)) name, lower(email)
from (
  select trim(teacher_name) as name, trim(teacher_email) as email, count(*) as uses
  from public.courses
  where coalesce(trim(teacher_email), '') <> '' and coalesce(trim(teacher_name), '') <> ''
  group by 1, 2
) t
order by lower(email), uses desc, name;

-- Designations and phone numbers from the Course Instructors sheet (2nd year, 2025).
insert into public.teachers (name, email, designation, phone) values
  ('Mazharul Islam',    'imazharul175@gmail.com',        'Lecturer',            '01910-545241'),
  ('Shatu Karmokar',    'shatunatore98@gmail.com',       'Lecturer',            '01758-020133'),
  ('Swarna Roy',        'swarnabdcse@gmail.com',         'Lecturer',            '01789-596014'),
  ('Shohanur Rahman',   'sohanurr973@gmail.com',         'Lecturer',            '01981-754988'),
  ('Md. Noman Hossain', 'ku.nomanhossain@gmail.com',     'Assistant Professor', '01701-058542'),
  ('Sharmin Akter',     'aktarsharmin.ice.30@gmail.com', 'Lecturer',            '01516-365933'),
  ('Shantunu Mondal',   'shantunu181214@gmail.com',      'Lecturer',            '01765-311093')
on conflict (lower(email)) where email is not null and email <> ''
do update set designation = excluded.designation, phone = excluded.phone;

-- One spelling for Sharmin Akter (courses used both "Akter" and "Aktar").
update public.teachers set name = 'Sharmin Akter' where lower(email) = 'aktarsharmin.ice.30@gmail.com';
update public.courses set teacher_name = 'Sharmin Akter' where lower(trim(teacher_email)) = 'aktarsharmin.ice.30@gmail.com';

-- Whoever takes a course joins the list automatically.
create or replace function public.add_course_teacher()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text := nullif(trim(coalesce(new.teacher_name, '')), '');
  v_email text := nullif(lower(trim(coalesce(new.teacher_email, ''))), '');
begin
  if v_email is not null then
    insert into teachers (name, email) values (coalesce(v_name, split_part(v_email, '@', 1)), v_email)
    on conflict (lower(email)) where email is not null and email <> '' do nothing;
  elsif v_name is not null and not exists (select 1 from teachers where lower(name) = lower(v_name)) then
    insert into teachers (name) values (v_name);
  end if;
  return new;
end $$;

create trigger courses_add_teacher after insert or update of teacher_name, teacher_email on public.courses
  for each row execute function public.add_course_teacher();

commit;
