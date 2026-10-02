-- 001: Row Level Security by role.
--
-- Run AFTER scripts/migrate-users-to-auth.mjs has created the Auth accounts and the
-- new app code is deployed — once this runs, the old localStorage login stops working.
-- Runs as one transaction: if any statement fails, nothing is changed.
--
-- Roles come from auth.users.app_metadata.role, which only the service role can set.
-- Anonymous visitors and self-signed-up accounts (no role) can read nothing.

begin;

-- ---------- helpers ----------
create or replace function public.app_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.app_student_id() returns text
language sql stable as $$
  select auth.jwt() -> 'app_metadata' ->> 'student_id'
$$;

create or replace function public.is_faculty(variadic roles text[] default array['hod','finance','academic','exam','advisor'])
returns boolean language sql stable as $$
  select public.app_role() = any(roles)
$$;

-- ---------- master_students ----------
alter table public.master_students enable row level security;

create policy "faculty read students" on public.master_students
  for select to authenticated using (public.is_faculty());
create policy "student reads own row" on public.master_students
  for select to authenticated using (public.app_role() = 'student' and id::text = public.app_student_id());
create policy "staff update students" on public.master_students
  for update to authenticated
  using (public.is_faculty('hod','finance','academic','exam'))
  with check (public.is_faculty('hod','finance','academic','exam'));
create policy "academic adds students" on public.master_students
  for insert to authenticated with check (public.is_faculty('hod','academic'));
create policy "academic removes students" on public.master_students
  for delete to authenticated using (public.is_faculty('hod','academic'));

-- ---------- courses ----------
alter table public.courses enable row level security;

create policy "everyone signed in reads courses" on public.courses
  for select to authenticated using (public.app_role() <> '');
create policy "academic manages courses" on public.courses
  for all to authenticated
  using (public.is_faculty('hod','academic'))
  with check (public.is_faculty('hod','academic'));

-- ---------- ct_marks ----------
alter table public.ct_marks enable row level security;

create policy "faculty read marks" on public.ct_marks
  for select to authenticated using (public.is_faculty());
create policy "student reads own marks" on public.ct_marks
  for select to authenticated using (public.app_role() = 'student' and student_id::text = public.app_student_id());
create policy "academic manages marks" on public.ct_marks
  for all to authenticated
  using (public.is_faculty('hod','academic'))
  with check (public.is_faculty('hod','academic'));

-- ---------- department_notices ----------
alter table public.department_notices enable row level security;

create policy "everyone signed in reads notices" on public.department_notices
  for select to authenticated using (public.app_role() <> '');
create policy "academic manages notices" on public.department_notices
  for all to authenticated
  using (public.is_faculty('hod','academic'))
  with check (public.is_faculty('hod','academic'));

-- ---------- faculty_users ----------
-- Logins now go through Supabase Auth; this table is profile data only.
alter table public.faculty_users enable row level security;

create policy "faculty read own profile, hod reads all" on public.faculty_users
  for select to authenticated
  using (public.app_role() = 'hod' or (public.is_faculty() and lower(email) = lower(auth.jwt() ->> 'email')));
create policy "hod manages faculty" on public.faculty_users
  for all to authenticated
  using (public.app_role() = 'hod')
  with check (public.app_role() = 'hod');

-- ---------- fee_ledger + student_fee_summary (only if they exist) ----------
do $$
begin
  if to_regclass('public.fee_ledger') is not null then
    execute 'alter table public.fee_ledger enable row level security';
    execute $p$create policy "finance and exam read ledger" on public.fee_ledger
      for select to authenticated using (public.is_faculty('hod','finance','exam'))$p$;
    execute $p$create policy "student reads own ledger" on public.fee_ledger
      for select to authenticated using (public.app_role() = 'student' and student_uuid::text = public.app_student_id())$p$;
    execute $p$create policy "finance manages ledger" on public.fee_ledger
      for all to authenticated
      using (public.is_faculty('hod','finance'))
      with check (public.is_faculty('hod','finance'))$p$;
  end if;

  -- Views bypass RLS by default; make this one respect the caller's permissions.
  if to_regclass('public.student_fee_summary') is not null then
    execute 'alter view public.student_fee_summary set (security_invoker = true)';
  end if;
end $$;

commit;
