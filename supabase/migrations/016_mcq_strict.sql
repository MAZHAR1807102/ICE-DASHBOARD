-- 016: Strict mode for MCQ exams — the same rule as coding tests (015): leaving the exam page once
-- gives a warning, the second time the person is logged out and blocked until the HOD unblocks them.
--
-- * mcq_exams.strict (default on for new exams; existing exams stay as they were: off).
-- * mcq_attempts: warnings, every time they left (violations), blocked, blocked_at.
-- * mcq_violation(attempt, kind): counts one leave atomically (events within 4 s are one leave);
--   called by the server only (service role). Unblocking goes through /api/mcq/manage (HOD).
-- Run after 015. One transaction: if anything fails, nothing changes.

begin;

alter table public.mcq_exams add column strict boolean not null default false;
alter table public.mcq_exams alter column strict set default true;

alter table public.mcq_attempts
  add column warnings integer not null default 0,
  add column violations jsonb not null default '[]'::jsonb,
  add column blocked boolean not null default false,
  add column blocked_at timestamptz;

create or replace function public.mcq_violation(p_attempt uuid, p_kind text)
returns table (warnings integer, blocked boolean)
language plpgsql security definer set search_path = public as $$
declare
  v mcq_attempts;
  v_last timestamptz;
begin
  select * into v from mcq_attempts where id = p_attempt for update;
  if not found then return; end if;
  v_last := (v.violations -> -1 ->> 'at')::timestamptz;
  if v.blocked or v.submitted_at is not null or (v_last is not null and now() - v_last < interval '4 seconds') then
    return query select v.warnings, v.blocked;
    return;
  end if;
  update mcq_attempts a
     set warnings = a.warnings + 1,
         violations = a.violations || jsonb_build_object('at', now(), 'kind', left(coalesce(p_kind, 'left'), 40)),
         blocked = a.warnings + 1 >= 2,
         blocked_at = case when a.warnings + 1 >= 2 then now() else a.blocked_at end
   where a.id = p_attempt
  returning a.warnings, a.blocked into v.warnings, v.blocked;
  return query select v.warnings, v.blocked;
end $$;
revoke all on function public.mcq_violation(uuid, text) from public, anon, authenticated;
grant execute on function public.mcq_violation(uuid, text) to service_role;

commit;
