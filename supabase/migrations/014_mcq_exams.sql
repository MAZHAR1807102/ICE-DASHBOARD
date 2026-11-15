-- 014: MCQ exams (HOD panel → students of a semester, or anyone with the link + password).
--
-- * mcq_exams: one row per exam — title, the semester it is for (null = link only), time limit,
--   draft/open/closed, the link code and its password, and the questions with their answer key
--   (jsonb: [{ "text": …, "options": [ … ], "answer": 0-based index }]).
-- * mcq_attempts: one row per person per exam (unique by roll). The server sets the deadline when
--   they start, keeps their answers as they go, and grades them on submit (or at the deadline).
--
-- Only the HOD reads or changes these tables directly. Students and link guests never touch them:
-- they go through /api/mcq/*, which runs on the server, hides the answer key until the attempt is
-- submitted, and enforces the timer. Run after 013. One transaction: if anything fails, nothing changes.

begin;

create table public.mcq_exams (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (length(trim(title)) > 0),
  semester          smallint check (semester between 1 and 8),
  duration_minutes  integer not null check (duration_minutes between 1 and 300),
  status            text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  code              text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  password          text not null check (length(password) between 4 and 40),
  questions         jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  opened_at         timestamptz,
  closed_at         timestamptz
);

create table public.mcq_attempts (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references public.mcq_exams (id) on delete cascade,
  student_id      uuid references public.master_students (id) on delete set null,
  roll            text not null check (length(trim(roll)) > 0),
  name            text not null check (length(trim(name)) > 0),
  token           text not null unique,
  started_at      timestamptz not null default now(),
  deadline        timestamptz not null,
  answers         jsonb not null default '[]'::jsonb,
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  score           integer,
  total           integer,
  unique (exam_id, roll)
);
create index mcq_attempts_exam_idx on public.mcq_attempts (exam_id);

alter table public.mcq_exams enable row level security;
alter table public.mcq_attempts enable row level security;

create policy "hod manages mcq exams" on public.mcq_exams
  for all to authenticated using (public.is_faculty('hod')) with check (public.is_faculty('hod'));
create policy "hod manages mcq attempts" on public.mcq_attempts
  for all to authenticated using (public.is_faculty('hod')) with check (public.is_faculty('hod'));

commit;
