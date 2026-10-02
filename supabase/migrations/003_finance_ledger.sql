-- 003: Finance ledger — every charge, payment and correction is a permanent row.
--
-- * finance_transactions is append-only: rows can't be edited or deleted; mistakes are
--   fixed with an 'adjustment' that must carry a reason.
-- * master_students.monthly_due / semester_due / exam_due / attendance_fine / total_fines_paid
--   stay as they are (every page reads them) but are now recalculated from the ledger by a
--   trigger, and nobody can write to them directly.
-- * The same fee can't be charged twice to a student for the same semester.
-- * Payments larger than what is owed are rejected.
-- * Current balances are carried over as opening entries, so every student's numbers stay the same.
--
-- Run after 001. Runs as one transaction: if any statement fails, nothing is changed.

begin;

-- ---------- 1. The ledger ----------
create table public.finance_transactions (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.master_students(id) on delete restrict,
  category        text not null check (category in ('monthly', 'semester', 'ru_exam', 'fine')),
  kind            text not null check (kind in ('charge', 'payment', 'adjustment')),
  amount          numeric(12, 2) not null,
  semester        integer not null,
  is_opening      boolean not null default false,
  receipt_id      uuid,
  note            text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),

  constraint amount_sign check (
    (kind in ('charge', 'payment') and amount > 0) or (kind = 'adjustment' and amount <> 0)
  ),
  constraint adjustment_needs_reason check (
    kind <> 'adjustment' or length(trim(coalesce(note, ''))) > 0
  )
);

-- One bill / one auto-fine per student, fee type and semester.
create unique index finance_one_charge_per_semester
  on public.finance_transactions (student_id, category, semester)
  where kind = 'charge' and not is_opening;

create index finance_transactions_student_idx
  on public.finance_transactions (student_id, created_at desc);

-- ---------- 2. Balance bookkeeping ----------
create or replace function public.finance_balance(p_student uuid, p_category text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'payment' then -amount else amount end), 0)
  from finance_transactions
  where student_id = p_student and category = p_category
$$;

create or replace function public.refresh_student_balance(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update master_students s set
    monthly_due      = round(public.finance_balance(p_student, 'monthly')),
    semester_due     = round(public.finance_balance(p_student, 'semester')),
    exam_due         = round(public.finance_balance(p_student, 'ru_exam')),
    attendance_fine  = round(public.finance_balance(p_student, 'fine')),
    total_fines_paid = round(coalesce((
      select sum(amount) from finance_transactions
      where student_id = p_student and category = 'fine' and kind = 'payment'
    ), 0))
  where s.id = p_student;
end $$;

-- Stamps who made the entry and validates it before it is written.
create or replace function public.finance_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_semester integer;
  v_due      numeric;
  v_label    text := case new.category
                       when 'monthly'  then 'monthly fee'
                       when 'semester' then 'semester fee'
                       when 'ru_exam'  then 'RU exam fee'
                       else 'fine' end;
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_by_name := coalesce(auth.jwt() -> 'app_metadata' ->> 'name', auth.jwt() ->> 'email');
  end if;

  -- Lock the student so two payments entered at the same moment can't both pass the check.
  select semester into v_semester from master_students where id = new.student_id for update;
  if not found then
    raise exception 'Student not found.';
  end if;
  new.semester := coalesce(new.semester, v_semester);

  if not new.is_opening and (new.kind = 'payment' or (new.kind = 'adjustment' and new.amount < 0)) then
    v_due := public.finance_balance(new.student_id, new.category);
    if abs(new.amount) > v_due then
      raise exception 'Amount ৳% is more than the ৳% % currently owed.', trim_scale(abs(new.amount)), trim_scale(v_due), v_label;
    end if;
  end if;

  return new;
end $$;

create or replace function public.finance_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_student_balance(new.student_id);
  return null;
end $$;

create trigger finance_validate before insert on public.finance_transactions
  for each row execute function public.finance_before_insert();
create trigger finance_refresh after insert on public.finance_transactions
  for each row execute function public.finance_after_insert();

-- ---------- 3. Who can see and write ledger entries ----------
alter table public.finance_transactions enable row level security;

create policy "finance staff read ledger" on public.finance_transactions
  for select to authenticated using (public.is_faculty('hod', 'finance', 'exam'));
create policy "student reads own ledger" on public.finance_transactions
  for select to authenticated using (public.app_role() = 'student' and student_id::text = public.app_student_id());
create policy "finance adds ledger entries" on public.finance_transactions
  for insert to authenticated with check (public.is_faculty('hod', 'finance'));

-- Append-only: no one edits or deletes history.
revoke update, delete, truncate on public.finance_transactions from anon, authenticated;

-- ---------- 4. Balance columns can only change through the ledger ----------
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'master_students'
    and column_name not in ('id', 'created_at', 'monthly_due', 'semester_due', 'exam_due',
                            'attendance_fine', 'total_fines_paid');

  execute 'revoke insert, update on public.master_students from anon, authenticated';
  execute format('grant insert (%s), update (%s) on public.master_students to authenticated', v_cols, v_cols);
end $$;

-- ---------- 5. Finance actions (each call is all-or-nothing) ----------
create or replace function public.require_finance()
returns void language plpgsql stable as $$
begin
  if not public.is_faculty('hod', 'finance') then
    raise exception 'Only finance staff can do this.';
  end if;
end $$;

-- Mass billing. Monthly = 6 × the student's monthly rate (one semester's worth).
create or replace function public.bill_students(p_student_ids uuid[], p_category text)
returns json language plpgsql security invoker set search_path = public as $$
declare
  v_total integer;
  v_zero  integer;
  v_billed integer;
begin
  perform public.require_finance();
  if p_category not in ('monthly', 'semester', 'ru_exam') then
    raise exception 'Unknown fee type: %', p_category;
  end if;

  with targets as (
    select id, semester,
           case p_category
             when 'monthly'  then coalesce(agreed_monthly_fee, 0) * 6
             when 'semester' then coalesce(agreed_semester_fee, 0)
             else                 coalesce(agreed_ru_exam_fee, 0)
           end as amount
    from master_students
    where id = any(p_student_ids)
  )
  select count(*), count(*) filter (where amount <= 0) into v_total, v_zero from targets;

  insert into finance_transactions (student_id, category, kind, amount, semester, note)
  select id, p_category, 'charge', t.amount, semester,
         case p_category
           when 'monthly'  then 'Monthly fee × 6 — semester ' || semester
           when 'semester' then 'Semester fee — semester ' || semester
           else                 'RU exam fee — semester ' || semester
         end
  from (
    select id, semester,
           case p_category
             when 'monthly'  then coalesce(agreed_monthly_fee, 0) * 6
             when 'semester' then coalesce(agreed_semester_fee, 0)
             else                 coalesce(agreed_ru_exam_fee, 0)
           end as amount
    from master_students
    where id = any(p_student_ids)
  ) t
  where t.amount > 0
  on conflict (student_id, category, semester) where kind = 'charge' and not is_opening do nothing;
  get diagnostics v_billed = row_count;

  return json_build_object(
    'billed', v_billed,
    'skipped_zero_rate', v_zero,
    'already_billed', v_total - v_zero - v_billed
  );
end $$;

-- Attendance fine for students below the threshold; once per semester.
create or replace function public.apply_attendance_fines(
  p_student_ids uuid[], p_amount numeric default 1000, p_threshold integer default 60
)
returns json language plpgsql security invoker set search_path = public as $$
declare
  v_candidates integer;
  v_fined integer;
begin
  perform public.require_finance();
  if p_amount <= 0 then
    raise exception 'Fine amount must be positive.';
  end if;

  select count(*) into v_candidates
  from master_students
  where id = any(p_student_ids) and coalesce(attendance_percentage, 0) < p_threshold;

  insert into finance_transactions (student_id, category, kind, amount, semester, note)
  select id, 'fine', 'charge', p_amount, semester,
         'Attendance below ' || p_threshold || '% (' || coalesce(attendance_percentage, 0) || '%) — semester ' || semester
  from master_students
  where id = any(p_student_ids) and coalesce(attendance_percentage, 0) < p_threshold
  on conflict (student_id, category, semester) where kind = 'charge' and not is_opening do nothing;
  get diagnostics v_fined = row_count;

  return json_build_object('fined', v_fined, 'already_fined', v_candidates - v_fined);
end $$;

-- One receipt can cover several fee types; all lines share a receipt_id.
create or replace function public.record_payment(
  p_student_id uuid,
  p_monthly numeric default 0,
  p_semester numeric default 0,
  p_ru_exam numeric default 0,
  p_fine numeric default 0,
  p_note text default null
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_receipt uuid := gen_random_uuid();
begin
  perform public.require_finance();
  if coalesce(p_monthly, 0) < 0 or coalesce(p_semester, 0) < 0 or coalesce(p_ru_exam, 0) < 0 or coalesce(p_fine, 0) < 0 then
    raise exception 'Payment amounts cannot be negative.';
  end if;
  if coalesce(p_monthly, 0) + coalesce(p_semester, 0) + coalesce(p_ru_exam, 0) + coalesce(p_fine, 0) = 0 then
    raise exception 'Enter at least one payment amount.';
  end if;

  insert into finance_transactions (student_id, category, kind, amount, semester, receipt_id, note)
  select p_student_id, c.category, 'payment', c.amount, null, v_receipt, nullif(trim(p_note), '')
  from (values ('monthly', p_monthly), ('semester', p_semester), ('ru_exam', p_ru_exam), ('fine', p_fine))
       as c(category, amount)
  where coalesce(c.amount, 0) > 0;

  return v_receipt;
end $$;

-- Corrections and waivers: positive adds to what is owed, negative reduces it. Reason required.
create or replace function public.adjust_balance(
  p_student_id uuid, p_category text, p_amount numeric, p_reason text
)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_finance();
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required for every correction.';
  end if;

  insert into finance_transactions (student_id, category, kind, amount, semester, note)
  values (p_student_id, p_category, 'adjustment', p_amount, null, trim(p_reason));
end $$;

revoke execute on function public.bill_students(uuid[], text) from public, anon;
revoke execute on function public.apply_attendance_fines(uuid[], numeric, integer) from public, anon;
revoke execute on function public.record_payment(uuid, numeric, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.adjust_balance(uuid, text, numeric, text) from public, anon;
revoke execute on function public.refresh_student_balance(uuid) from public, anon, authenticated;
revoke execute on function public.finance_balance(uuid, text) from public, anon, authenticated;
grant execute on function public.bill_students(uuid[], text) to authenticated;
grant execute on function public.apply_attendance_fines(uuid[], numeric, integer) to authenticated;
grant execute on function public.record_payment(uuid, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.adjust_balance(uuid, text, numeric, text) to authenticated;

-- ---------- 6. Carry today's balances over as opening entries ----------
create temp table _before on commit drop as
  select id, monthly_due, semester_due, exam_due, attendance_fine, total_fines_paid
  from public.master_students;

insert into public.finance_transactions
  (student_id, category, kind, amount, semester, is_opening, note, created_by_name)
select s.id, o.category, o.kind, o.amount, s.semester, true,
       'Opening balance carried over from the old system', 'System migration'
from public.master_students s
cross join lateral (values
  ('monthly',  'charge',  coalesce(s.monthly_due, 0)),
  ('semester', 'charge',  coalesce(s.semester_due, 0)),
  ('ru_exam',  'charge',  coalesce(s.exam_due, 0)),
  ('fine',     'charge',  coalesce(s.attendance_fine, 0) + coalesce(s.total_fines_paid, 0)),
  ('fine',     'payment', coalesce(s.total_fines_paid, 0))
) as o(category, kind, amount)
where o.amount > 0
order by s.id, o.kind;  -- charges before payments

-- Students with no history still get their columns normalised to 0.
select public.refresh_student_balance(id) from public.master_students;

-- Safety check: every balance must be exactly what it was before.
do $$
declare
  v_changed integer;
begin
  select count(*) into v_changed
  from _before b join public.master_students s using (id)
  where coalesce(b.monthly_due, 0)      <> s.monthly_due
     or coalesce(b.semester_due, 0)     <> s.semester_due
     or coalesce(b.exam_due, 0)         <> s.exam_due
     or coalesce(b.attendance_fine, 0)  <> s.attendance_fine
     or coalesce(b.total_fines_paid, 0) <> s.total_fines_paid;
  if v_changed > 0 then
    raise exception 'Opening balances do not match for % student(s) — nothing was changed.', v_changed;
  end if;
end $$;

-- ---------- 7. Fee summary now reads the real balances ----------
-- (It used to read fee_ledger, which nothing ever wrote to, so it showed ৳0 owed for everyone.)
drop view if exists public.student_fee_summary;
create view public.student_fee_summary with (security_invoker = true) as
select college_id, ru_id, name, semester, agreed_monthly_fee, waiver_notes,
       monthly_due::numeric  as monthly_due,
       semester_due::numeric as semester_due,
       exam_due::numeric     as ru_exam_due,
       (coalesce(monthly_due, 0) + coalesce(semester_due, 0) + coalesce(exam_due, 0)
        + coalesce(attendance_fine, 0))::numeric as total_outstanding_due
from public.master_students;

-- The old, never-used fee_ledger table is removed only if it is still empty.
do $$
begin
  if to_regclass('public.fee_ledger') is not null then
    if exists (select 1 from public.fee_ledger) then
      raise notice 'fee_ledger has rows — left in place.';
    else
      drop table public.fee_ledger;
    end if;
  end if;
end $$;

commit;
