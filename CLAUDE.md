@AGENTS.md

# CSE Department Portal — project handoff

Last updated: 2026-11-15 (branch `mcq-exam` built: HOD MCQ exams; needs migration 014, not deployed)

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
- Deployed 2026-11-03 (no migrations): Grade calculator (Exam page + teacher portal; marks → UGC grade),
  Exams → "Custom CA sheet" (courses typed/loaded, rolls pasted/loaded, marks blank or full attendance +
  random CA totals from given values for 3 credits scaled to 2/4, CTs average exactly; standard
  70/20/10 format only — user said not to build the older 60/10/5 format in), CA sheets list each CT
  only for first-year courses.
- Teachers list + Assign teachers (migration 013) deployed 2026-10-26.
- Built 2026-11-15 on branch `mcq-exam`, **pending**: user runs `014_mcq_exams.sql`, then says deploy.
  HOD-only **MCQ Exams** (`/dashboard/mcq`; DASHBOARD_ACCESS ['hod']): create exam (title, semester or
  link-only, minutes, password), upload question set PDF/.docx/.txt or paste → `parseMcqText` (utils/mcq.ts:
  "1."/"Q1)"/Bangla ১। numbers; a)/(a)/A./ক) options, several per line OK; answers from "Ans: b", "উত্তর: খ",
  a */✓ on an option, or an "Answer key" section/bare "1-b 2-c" line) → editor to check/tick answers →
  Open (blocked until every question has ≥2 options + an answer) → Share link `/mcq/<code>` + password.
  Exam page `app/mcq/[code]` is public (not in proxy matcher): signed-in students of that semester join
  without password; others give password + name + roll; one attempt per roll (unique); server deadline,
  answers autosaved, auto-submit at 0:00 (30 s grace, overdue graded on saved answers), then score + review
  of wrong/unanswered with correct option. Results modal: best first, Excel, Reset attempt. Close grades
  unfinished attempts. Student portal strip `McqExams.tsx` (/api/mcq/mine). Questions lock once anyone joined.
  User choices: answers from PDF + HOD review (no AI); students via login + link guests; review shown at once.
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
- `supabase/migrations/001…014` + `supabase/README.md` (what each does, run order).
- MCQ: `utils/mcq.ts` (types, parser, grading), `utils/mcq-file.ts` (PDF/Word → lines, browser),
  `utils/mcq-server.ts` (service-role helpers), `app/api/mcq/{info,join,attempt,mine,manage}`,
  `app/dashboard/mcq` (HOD panel), `app/mcq/[code]` (exam page).
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
  Only first-year courses (code CSE1xxx…) list CT-1…n + CT (avg); 2nd–4th year sheets have one
  "Class Test" column with the CT mark (`showsEachCt` in `utils/ca-sheet.ts`, both CA buttons).
- Attendance sheet (`utils/attendance-sheet.ts`): copies the department's own sheet, which is in
  **Cambria** (not Times New Roman), A4 landscape; one sheet per running course of the semester;
  semester's students Regular then Readd by roll; 20 day boxes + P/A/%; 26 students a page.
- Admit card distribution (`utils/admit-card.ts`): same examinees as the roll sheet (`buildRollEntries`);
  Word, A4 portrait, Arial (their sample was a Helvetica PDF); exam title from course codes, not the
  semester number; Regular / Readd / Backlog tables, continuous SL; letterhead + Code No- 385 each page.
- Older syllabus CA format (used by hand for 3-2 exam 2024, rolls 21…/22…): Theory 60, one CT
  column 10, Attendance 5 for 3 credits. Not in the site (user's decision).
- Grade from marks: UGC bands by percentage (`GRADE_BANDS`/`gradeForMarks` in `utils/grades.ts`):
  80 A+ 4.00, 75 A, 70 A-, 65 B+, 60 B, 55 B-, 50 C+, 45 C, 40 D 2.00, below 40 F. Out of 25: A+ from 20.
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
- A modal opened inside the blurred sticky header (backdrop-blur) is trapped in it — portal it to body.
- `master_students.advisor` is NOT NULL: the Add student form fails if Advisor is left empty
  (insert `''`, as the existing rows have).
- Course codes in `courses` can have trailing spaces — normalise before matching.

## Next steps / open questions
- Deployed 2026-11-04 (no migration, verified on the live site): the `organize` changes —
  1. Student portal: no attendance recorded + no dues → "Attendance not recorded yet" / "Waiting for
     attendance" instead of "Exam blocked" (`studentExamStatus` in `utils/eligibility.ts`; the exam
     office's own check and stored statuses are unchanged).
  2. Exams header = Auto-check · Results ▾ (published, earlier) · Documents ▾ (roll, admit cards,
     attendance, lab, CA [+ custom], top sheet, grade calculator) · Publish. `app/components/MenuButton.tsx`.
  3. Semester chips with counts on Exams, Finance, Academic (Curriculum shows all 8); semester and
     Regular/Readd choice remembered per browser (`utils/useStoredState.ts`, keys exam./finance./academic.).
  4. Top sheet generator (`utils/top-sheet.ts`, Exams → Documents → Top sheet): page per bundle
     (Lab Mark / CA), upper copy From college → To Chairman (+ exam title), lower copy → Exam Controller;
     codes prefilled from Curriculum by code digits; 0.75" side margins so lines don't wrap.
  5. Advisory menu item marked "Soon" (page itself untouched).
- 2026-11-04: student records updated from the user's edited list (`~/Downloads/Student_list.docx`):
  9 missing semester-1 names filled, one college roll corrected, 3 students added (2 to sem 1,
  1 to sem 6, Readd) with student logins (default password); one more sem-1 Readd student added
  with a **temporary College Roll 24000** (real roll not known yet — replace it when the user has it).
  Placeholder-style rolls 19000/24000 are temporary. Now 151 students.
- Data gaps seen 2026-11-01 (not bugs): attendance entered only for semester 4, so most students
  show 0% and "Exam blocked"; advisors set for 1 of 147 students.
- Possible polish: on phones the roster's "View as student" button squeezes the name column.
- Attendance-mark bands for the CA sheet are an assumption (90%→full … <60%→0); confirm with RU rule.
