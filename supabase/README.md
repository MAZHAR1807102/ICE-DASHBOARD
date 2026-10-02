# Moving to Supabase Auth + RLS — rollout steps

Do these in order. Steps 1–2 don't affect the live site.

1. **Add the service role key** to `.env.local` (Supabase → Project Settings → API → `service_role`):
   `SUPABASE_SERVICE_ROLE_KEY=...` — server-only; never prefix it with `NEXT_PUBLIC_`.
   Add it to Vercel's environment variables too.
2. **Copy existing logins into Supabase Auth**:
   ```bash
   node --env-file=.env.local scripts/migrate-users-to-auth.mjs --dry-run   # preview
   node --env-file=.env.local scripts/migrate-users-to-auth.mjs
   ```
   Fix anything listed as skipped (missing RU ID, no password, password under 6 characters), then re-run.
3. **Turn off public sign-ups**: Supabase → Authentication → Sign In / Providers → disable "Allow new users to sign up".
4. **Deploy the `secure-auth` branch.**
5. **Immediately run** `migrations/001_enable_rls.sql` in the Supabase SQL editor.
6. **Test**: log in as each role (hod, finance, academic, exam, advisor) and as a student.
7. Once logins are confirmed, run `migrations/002_drop_plaintext_passwords.sql`.

New students: Academic dashboard → roster → **Set Login** creates or resets their portal password.

**Rollback** (before step 7): redeploy the previous commit and run
`alter table <table> disable row level security;` for each table in 001.

---

# Finance ledger (003) — rollout steps

Do this when finance staff aren't entering payments (takes ~5 minutes).

1. Supabase → SQL Editor → run `migrations/003_finance_ledger.sql`.
   It copies every student's current balance into the ledger as an opening entry and
   **checks that every balance is unchanged** — if anything doesn't match, it stops and changes nothing.
2. Right away, deploy the `finance-ledger` branch (merge into `main` and push).
   Between steps 1 and 2 the old finance page can still show balances, but saving payments fails.
3. Test as finance: record a small payment, open **History**, try billing twice (second time bills nobody).
