@AGENTS.md

# CSE Department Portal — project handoff

Last updated: 2026-11-01 (admit card distribution sheet deployed; read-only walkthrough of the live site — no errors)

## What this is
Student management system for the CSE department of **Imperial College of Engineering, Khulna**
(affiliated with the **University of Rajshahi, RU**). One web app with a login per role: HOD,
Finance, Academic, Exam office, Advisor (portal not built yet), course Teachers, Students.
Next.js 16 (App Router, `proxy.ts` instead of middleware) + React 19 + Tailwind 4 + Supabase
(Postgres, Auth, Row Level Security). Repo: github.com/MAZHAR1807102/ICE-DASHBOARD; Vercel deploys
`main` automatically to https://ice-dashboard-nine.vercel.app. The owner (the user) is a lecturer there, not deeply technical.

## Status
- Live on `main`: security (Auth + RLS), finance ledger, results (RU sheet import, running CGPA,
  editing with history), teacher portal (CT marks via emailed link), student portal, Regular/Readd
  grouping, roll sheets (Word) + Bangla/Bijoy import, admit-card lists, view-as-student,
  lab mark sheet, CA mark sheet, promotion + alumni, ending courses, teachers list (migrations 001–013 applied),
  attendance sheet (Academic header button), admit card distribution sheet (Exam page button); no migrations.
- Teachers list + Assign teachers (migration 013) deployed 2026-10-26.
- Not built: advisor portal (user said leave it), password cleanup (user chose to keep default
  student password; don't raise it).

## How the user wants to work
- Build on a branch → user runs the SQL migration in Supabase → user says **"deploy it"** →
  verify the migration with a service-key read → `git merge --ff-only` into `main` → push.
- **Ask before writing production data.** Tests must block/catch writes (see Testing).
- Never print or commit secrets (service key lives only in `.env.local` and Vercel).
- Give step-by-step, click-level instructions; plain language.
- Documents must match the department's real Word formats (Times New Roman, A4); check output
  by rendering in Microsoft Word, not macOS Quick Look.

## Map
- `app/dashboard/*` — staff pages: `academic` (roster, CT, curriculum, teachers, notices, promote,
  import details), `exam` (results, roll/lab/CA sheets, eligibility), `studAff` (finance),
  `alumni`, `page.tsx` (HOD overview). `app/student` — student portal (`_components/ProfileView`
  shared with `app/view-student/[id]`). `app/teacher` — teacher portal. `app/api/*` — server routes.
- `utils/` — `rollsheet*.ts` (roll sheets, data loading, .docx import incl. Bijoy→Unicode),
  `labsheet-docx.ts`, `ca-sheet.ts`, `result-sheet.ts` (RU PDF/Excel parser), `cohort.ts`
  (Regular/Readd), `grades.ts`, `profile.ts`, `types.ts`, `auth.ts` (roles, DASHBOARD_ACCESS).
- `supabase/migrations/001…013` + `supabase/README.md` (what each does, run order).
- Department's source documents (outside the repo): `../StudentRollSheet/`, `~/Downloads/`
  (CA sheets, lab mark sheet, roll sheets, teacher lists, top sheets).

## Rules and numbers (keep consistent)
- Degree 160 credits; best attempt counts, F = 0.00; running CGPA in `refresh_academic_standing`.
- Exam eligibility: ≥60% attendance and no dues, or coordinator override.
- Regular = majority RU-ID series (first 7 digits) per semester; others Readd. RU ID 25… → session 2024-25.
- RU course code: 1st digit year, 2nd semester (CSE2111 → 2nd Year 1st Semester); odd last digit
  theory, even lab. The `courses` table files 2-1 codes under semester 4 (data quirk).
- Theory marks on roll sheet: 17.5 per credit (years 1–3), 20 (year 4).
- Lab mark sheet: 25 per credit split 70/20/10 (Experiment/CT/AT), 13 students a page.
- CA sheet: 25 per credit; Attendance 10%, CT 20%, Theory 70%; 2-credit 3 CTs (out of 10),
  3-credit 4 CTs (out of 15); CT avg = mean to nearest 0.5; 18 students a page, heading + signature
  (teacher name from the course list) on every page.
- Attendance sheet (`utils/attendance-sheet.ts`): copies the department's own sheet, which is in
  **Cambria** (not Times New Roman), A4 landscape; one sheet per running course of the semester;
  semester's students Regular then Readd by roll; 20 day boxes + P/A/%; 26 students a page.
- Admit card distribution (`utils/admit-card.ts`): same examinees as the roll sheet (`buildRollEntries`);
  Word, A4 portrait, Arial (their sample was a Helvetica PDF); exam title from course codes, not the
  semester number; Regular / Readd / Backlog tables, continuous SL; letterhead + Code No- 385 each page.
- Promotion: suggest hold-back only when RU result says fail; held back = stays (becomes Readd);
  semester 8 → graduated (Alumni; Finance keeps them while owing); move resets attendance,
  eligibility override, exam registration.

## Testing (all in the session scratchpad, which gets wiped — recreate as needed)
- DB: PGlite in-memory Postgres with stubbed `auth.jwt()/app_role()/is_faculty()`, run the
  migration file, assert behaviour.
- Browser: Puppeteer + `npx next dev -p 3123`, sign in via admin `generateLink` magic link;
  intercept POST/PATCH/DELETE to Supabase so nothing is written; fake tables of unapplied migrations.
  `rpc/teacher_courses` and `rpc/teacher_roster` are POSTs that only read — let them through.
  The same tour works against the live URL (cookies on its domain, `secure: true`).
- Word output: `osascript` → Microsoft Word "save as PDF", then render pages with pypdfium2.
- Always `npx tsc --noEmit -p .`, `npx eslint`, `npm run build` before committing.

## Pitfalls already hit
- Cloud (claude.ai) sessions: npm registry blocked → no `npm ci`, so no tsc/eslint/build of the app;
  a global `docx` + LibreOffice (Caladea ≈ Cambria) can still render generators. Vercel *preview*
  builds fail for every branch (env vars are Production-only) — not a code signal. Commit as the owner.
- React-compiler lint: load data with `.then()` in effects; no mutating variables during render.
- New `master_students` columns need explicit column grants (balances are ledger-only).
- zsh: an unmatched glob aborts a `&&` chain; puppeteer's Chrome must be reinstalled after updates.
- Quick Look shows neither Word page breaks nor merged cells — check in Word.
- The user's own Word files often have no real page breaks (empty lines) — use pageBreakBefore.
- Course codes in `courses` can have trailing spaces — normalise before matching.

## Next steps / open questions
- (none pending deploy)
- Data gaps seen 2026-11-01 (not bugs): attendance entered only for semester 4, so most students
  show 0% and "Exam blocked"; advisors set for 1 of 147 students.
- Possible polish: on phones the roster's "View as student" button squeezes the name column, and
  roster/exam/finance lists are very long (no per-semester collapse).
- Attendance-mark bands for the CA sheet are an assumption (90%→full … <60%→0); confirm with RU rule.
