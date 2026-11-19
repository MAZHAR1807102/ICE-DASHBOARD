-- 015: Online judge — coding problems, coding tests (lab test, exam, assignment, practice, contest),
-- the people taking them, and their submissions.
--
-- * judge_problems: a teacher's problem — statement, input/output format, sample cases (shown) and
--   test cases (hidden), time and memory limits. Every teacher can see the shared problem bank;
--   only its author (or the HOD) changes it.
-- * judge_tests: a teacher's coding test — kind, the semester it is for (null = link + password only),
--   draft/open/closed, link code + password, languages, optional timer (per person) and deadline,
--   strict mode (no copy/paste; leaving the page once = warning, twice = blocked), and its problems
--   with their points (jsonb: [{ "id": problem uuid, "points": 100 }]).
-- * judge_participants: one row per person per test (unique by roll), with the strict-mode record:
--   warnings, every time they left the page (violations), and whether they are blocked. Only the
--   HOD unblocks (through /api/judge/manage).
-- * judge_submissions: the code sent, its verdict, how many test cases passed and the score.
--
-- Teachers read their own tests' participants and submissions; the HOD reads all. Students and link
-- guests never touch these tables: they go through /api/judge/*, which runs on the server, never
-- sends hidden test cases, enforces the timer and strict mode, and talks to the judge server.
-- Run after 014. One transaction: if anything fails, nothing changes.

begin;

-- Anyone who can open the teacher portal: course teachers and office staff who teach.
create or replace function public.is_teacher() returns boolean
language sql stable as $$
  select public.app_role() = any (array['teacher', 'hod', 'finance', 'academic', 'exam', 'advisor'])
$$;

create table public.judge_problems (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(trim(title)) between 1 and 200),
  statement      text not null default '',
  input_format   text not null default '',
  output_format  text not null default '',
  samples        jsonb not null default '[]'::jsonb check (jsonb_typeof(samples) = 'array'),
  tests          jsonb not null default '[]'::jsonb check (jsonb_typeof(tests) = 'array'),
  time_limit_ms  integer not null default 1000 check (time_limit_ms between 100 and 10000),
  memory_mb      integer not null default 256 check (memory_mb between 16 and 1024),
  created_by     uuid default auth.uid(),
  author_name    text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.judge_tests (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (length(trim(title)) between 1 and 200),
  kind              text not null default 'lab' check (kind in ('lab', 'exam', 'assignment', 'practice', 'contest')),
  semester          smallint check (semester between 1 and 8),
  status            text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  code              text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  password          text not null check (length(password) between 4 and 40),
  languages         text[] not null default array['c', 'cpp', 'java'],
  duration_minutes  integer check (duration_minutes between 1 and 1440),
  ends_at           timestamptz,
  strict            boolean not null default true,
  problems          jsonb not null default '[]'::jsonb check (jsonb_typeof(problems) = 'array'),
  created_by        uuid default auth.uid(),
  author_name       text not null default '',
  created_at        timestamptz not null default now(),
  opened_at         timestamptz,
  closed_at         timestamptz
);

create table public.judge_participants (
  id              uuid primary key default gen_random_uuid(),
  test_id         uuid not null references public.judge_tests (id) on delete cascade,
  student_id      uuid references public.master_students (id) on delete set null,
  roll            text not null check (length(trim(roll)) > 0),
  name            text not null check (length(trim(name)) > 0),
  token           text not null unique,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  warnings        integer not null default 0,
  violations      jsonb not null default '[]'::jsonb,
  blocked         boolean not null default false,
  blocked_at      timestamptz,
  last_submit_at  timestamptz,
  last_run_at     timestamptz,
  unique (test_id, roll)
);
create index judge_participants_test_idx on public.judge_participants (test_id);

create table public.judge_submissions (
  id              uuid primary key default gen_random_uuid(),
  test_id         uuid not null references public.judge_tests (id) on delete cascade,
  participant_id  uuid not null references public.judge_participants (id) on delete cascade,
  problem_id      uuid not null references public.judge_problems (id) on delete cascade,
  language        text not null,
  source          text not null check (length(source) <= 65536),
  status          text not null default 'pending' check (status in ('pending', 'running', 'AC', 'WA', 'TLE', 'RE', 'CE', 'IE')),
  judge_tokens    jsonb,
  passed          integer,
  total           integer,
  points          integer not null default 100,
  score           numeric,
  time_ms         integer,
  memory_kb       integer,
  failed_test     integer,
  message         text,
  created_at      timestamptz not null default now(),
  judged_at       timestamptz
);
create index judge_submissions_test_idx on public.judge_submissions (test_id);
create index judge_submissions_participant_idx on public.judge_submissions (participant_id);

-- Strict mode: someone left the page. One leave counts once (several browser events within a few
-- seconds are one leave). The 1st is a warning; the 2nd blocks them. Atomic, so two tabs can't race.
-- Called by the server only (service role).
create or replace function public.judge_violation(p_participant uuid, p_kind text)
returns table (warnings integer, blocked boolean)
language plpgsql security definer set search_path = public as $$
declare
  v judge_participants;
  v_last timestamptz;
begin
  select * into v from judge_participants where id = p_participant for update;
  if not found then return; end if;
  v_last := (v.violations -> -1 ->> 'at')::timestamptz;
  if v.blocked or v.finished_at is not null or (v_last is not null and now() - v_last < interval '4 seconds') then
    return query select v.warnings, v.blocked;
    return;
  end if;
  update judge_participants p
     set warnings = p.warnings + 1,
         violations = p.violations || jsonb_build_object('at', now(), 'kind', left(coalesce(p_kind, 'left'), 40)),
         blocked = p.warnings + 1 >= 2,
         blocked_at = case when p.warnings + 1 >= 2 then now() else p.blocked_at end
   where p.id = p_participant
  returning p.warnings, p.blocked into v.warnings, v.blocked;
  return query select v.warnings, v.blocked;
end $$;
revoke all on function public.judge_violation(uuid, text) from public, anon, authenticated;
grant execute on function public.judge_violation(uuid, text) to service_role;

alter table public.judge_problems enable row level security;
alter table public.judge_tests enable row level security;
alter table public.judge_participants enable row level security;
alter table public.judge_submissions enable row level security;

-- Problem bank: every teacher reads it; the author or the HOD changes a problem.
create policy "teachers read problems" on public.judge_problems
  for select to authenticated using (public.is_teacher());
create policy "teachers add problems" on public.judge_problems
  for insert to authenticated with check (public.is_teacher() and created_by = auth.uid());
create policy "author or hod changes problems" on public.judge_problems
  for update to authenticated using (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')))
  with check (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')));
create policy "author or hod deletes problems" on public.judge_problems
  for delete to authenticated using (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')));

-- Tests: a teacher works on their own; the HOD on all.
create policy "teachers read own tests" on public.judge_tests
  for select to authenticated using (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')));
create policy "teachers add tests" on public.judge_tests
  for insert to authenticated with check (public.is_teacher() and created_by = auth.uid());
create policy "owner or hod changes tests" on public.judge_tests
  for update to authenticated using (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')))
  with check (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')));
create policy "owner or hod deletes tests" on public.judge_tests
  for delete to authenticated using (public.is_teacher() and (created_by = auth.uid() or public.is_faculty('hod')));

-- Participants and submissions: read-only here (changes go through /api/judge/*).
create policy "test owner reads participants" on public.judge_participants
  for select to authenticated using (exists (select 1 from public.judge_tests t where t.id = test_id));
create policy "test owner reads submissions" on public.judge_submissions
  for select to authenticated using (exists (select 1 from public.judge_tests t where t.id = test_id));

commit;
