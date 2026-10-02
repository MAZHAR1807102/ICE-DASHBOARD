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
