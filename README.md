# CSE Department Portal

Student management for the Department of CSE, Imperial College of Engineering.
Built with Next.js 16 (App Router), React 19, Tailwind CSS 4 and Supabase.

## Who uses what

| Role | Lands on | Does |
|---|---|---|
| `hod` | `/dashboard` | Department overview, escalations, access to every portal |
| `finance` | `/dashboard/studAff` | Fee rates, mass billing, payments, corrections, payment history |
| `academic` | `/dashboard/academic` | Students, courses, attendance, CT marks, notices, student logins |
| `exam` | `/dashboard/exam` | Exam registration status, automatic eligibility check |
| `advisor` | `/dashboard/advisor` | Advisee overview (preview — sample data for now) |
| student | `/student` | Own marks, attendance, dues, notices |

Faculty sign in at `/login` with their email; students at `/student-login` with their RU ID.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

`.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only: creating student logins, migration script
EMAIL_USER=...                  # Gmail account used to email rosters to teachers
EMAIL_PASS=...                  # Gmail app password
```

## How it's put together

- **Auth** — Supabase Auth with cookie sessions. Each user's role lives in `app_metadata.role`.
  `proxy.ts` sends people to the right area; API routes check roles with `requireRole()`.
- **Data access** — pages query Supabase directly as the signed-in user; Row Level Security
  policies (`supabase/migrations/001_enable_rls.sql`) decide what each role can read and change.
- **Money** — every charge, payment and correction is a row in `finance_transactions`
  (`003_finance_ledger.sql`). Balance columns on `master_students` are derived from it and
  can't be edited directly.
- **Exam eligibility** — one rule in `utils/eligibility.ts`: at least 60% attendance and nothing
  owed, or the academic coordinator's override.

```
app/
  page.tsx                 landing page
  login/, student-login/   sign-in pages
  dashboard/               faculty portals (each with a _components/ folder)
  student/                 student portal
  components/              shared UI (header, modal, password change)
  api/                     server routes (eligibility check, roster email, student logins)
utils/                     Supabase clients, auth helpers, types, CSV helpers
supabase/                  SQL migrations and rollout notes
scripts/                   one-time account migration
```

Database changes live in `supabase/migrations/` and are run in the Supabase SQL editor —
see `supabase/README.md` for the order.
