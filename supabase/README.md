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

---

# Course results (004)

Safe to run any time — it only adds a new table; nothing existing changes.

1. Supabase → SQL Editor → run `migrations/004_course_results.sql` (choose "Run without RLS" if warned —
   the new table enables RLS itself).
2. Deploy the code.
3. Exam office: Exam dashboard → **📊 Publish Results** → choose semester → Download Template →
   fill the Grade column (A+, A, A-, B+, B, B-, C+, C, D, F) → upload → check the preview → Publish.

CGPA and backlogs on each student update automatically from the latest attempt of every course.

---

# Teacher portal (005)

Safe to run any time — adds two columns to `courses` and three functions; nothing else changes.

1. Supabase → SQL Editor → run `migrations/005_teacher_portal.sql`.
2. Recommended: Supabase → Authentication → **Email** → set "Email OTP Expiration" to `86400`
   (24 hours) so emailed sign-in links stay valid for a day. Teachers can always request a new
   link at `/teacher-login`.
3. Deploy the code.
4. Academic office: Academic → Curriculum & Faculty → make sure each course has the teacher's
   email → pick the semester → **📧 Email CT links to teachers** (or **Send link** on one course).

---

# Official RU result sheets (006)

Safe to run any time — widens `course_results.credit` to two decimals (0.75-credit labs) and adds
the `semester_results` table; existing data is unchanged.

1. Supabase → SQL Editor → run `migrations/006_official_results.sql` ("Run without RLS" if warned).
2. Deploy the code.
3. Exam office: Exams → **Publish Results** → **RU result sheet** → upload the PDF / Excel exactly
   as RU sends it → check the semester and course credits → Publish.
   Scanned (image-only) PDFs can't be read — use the Excel file or a PDF exported from Excel/Word.

---

# Running CGPA (007)

Run **before** deploying the matching code — the exam page reads the new `credits_earned` column.

1. Supabase → SQL Editor → run `migrations/007_cumulative_cgpa.sql`.
2. Deploy the code.

Rules it applies (F = 0.00 matches every GPA on RU's own sheets):
- Every attempt is kept (regular, retake, improvement); for each course the **best** grade counts.
- An F counts as 0.00 until a better attempt replaces it.
- Exams → **Earlier results**: a starting CGPA ("through semester N, X credits, CGPA Y") for
  semesters published before the portal. Uploaded results after semester N are added on top.

---

# Atomic result publishing (008)

Run **before** deploying the matching code — Publish Results calls `publish_results()`.

1. Supabase → SQL Editor → run `migrations/008_publish_results_atomic.sql`.
2. Deploy the code.
3. Re-upload any sheet that failed with "ON CONFLICT DO UPDATE command cannot affect row a second
   time" (the semester 1 improvement sheet): its grades were saved but its official figures weren't.
   Re-uploading the same file replaces the grades and adds the missing figures — no duplicates.

---

# Editing published results (009)

Run **before** deploying the matching code — the editors call the new functions.

1. Supabase → SQL Editor → run `migrations/009_result_editing.sql`.
2. Deploy the code.

Exams → **Results** (on any student): edit a grade / credit / course code / semester, add or delete a
course result, edit or delete the official figures. Every change asks for a reason and is kept in
`result_changes` (who, when, before → after, reason) — nobody can edit or delete that history.
Rename / Remove in **Published results** are recorded the same way.
