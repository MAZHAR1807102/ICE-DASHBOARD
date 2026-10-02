// One-time migration: copy faculty_users and master_students logins into Supabase Auth.
//
// Each person keeps their current password (Supabase stores it hashed) and gets their
// role written to app_metadata, which users cannot edit themselves.
// Safe to re-run: existing accounts are updated rather than duplicated.
//
// Usage (needs SUPABASE_SERVICE_ROLE_KEY in .env.local — never expose it to the browser):
//   node --env-file=.env.local scripts/migrate-users-to-auth.mjs --dry-run
//   node --env-file=.env.local scripts/migrate-users-to-auth.mjs

import { createClient } from '@supabase/supabase-js';

// Keep in sync with utils/auth.ts
const STUDENT_EMAIL_DOMAIN = 'students.ice-portal.local';
const FACULTY_ROLES = ['hod', 'finance', 'academic', 'exam', 'advisor'];

const dryRun = process.argv.includes('--dry-run');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function existingUsersByEmail() {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => byEmail.set(u.email?.toLowerCase(), u));
    if (data.users.length < 1000) return byEmail;
  }
}

async function upsertUser(existing, email, password, appMetadata) {
  const current = existing.get(email.toLowerCase());
  if (dryRun) return current ? 'would update' : 'would create';

  if (current) {
    const { error } = await admin.auth.admin.updateUserById(current.id, {
      password,
      app_metadata: appMetadata,
    });
    if (error) throw error;
    return 'updated';
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error) throw error;
  return 'created';
}

const existing = await existingUsersByEmail();
const problems = [];
const counts = {};
const tally = (result) => (counts[result] = (counts[result] ?? 0) + 1);

// --- Faculty ---
const { data: faculty, error: facultyError } = await admin
  .from('faculty_users')
  .select('id, email, password, role, name');
if (facultyError) throw facultyError;

for (const f of faculty) {
  const label = `faculty ${f.email}`;
  if (!f.email || !f.password) { problems.push(`${label}: missing email or password`); continue; }
  if (!FACULTY_ROLES.includes(f.role)) { problems.push(`${label}: unknown role "${f.role}"`); continue; }
  if (f.password.length < 6) { problems.push(`${label}: password shorter than 6 characters (Supabase minimum)`); continue; }
  try {
    tally(await upsertUser(existing, f.email.trim(), f.password, { role: f.role, name: f.name ?? '' }));
  } catch (e) {
    problems.push(`${label}: ${e.message}`);
  }
}

// --- Students ---
const { data: students, error: studentError } = await admin
  .from('master_students')
  .select('id, ru_id, name, student_password');
if (studentError) throw studentError;

for (const s of students) {
  const label = `student ${s.ru_id ?? s.id}`;
  if (!s.ru_id) { problems.push(`${label}: no RU ID`); continue; }
  if (!s.student_password) { problems.push(`${label}: no password set — cannot log in until one is assigned`); continue; }
  if (s.student_password.length < 6) { problems.push(`${label}: password shorter than 6 characters (Supabase minimum)`); continue; }
  try {
    const email = `${String(s.ru_id).trim()}@${STUDENT_EMAIL_DOMAIN}`;
    tally(await upsertUser(existing, email, s.student_password, {
      role: 'student',
      name: s.name ?? '',
      student_id: s.id,
    }));
  } catch (e) {
    problems.push(`${label}: ${e.message}`);
  }
}

console.log(dryRun ? '\nDRY RUN — nothing was changed.' : '\nDone.');
console.log(`Faculty rows: ${faculty.length}, student rows: ${students.length}`);
console.log(counts);
if (problems.length) {
  console.log(`\n${problems.length} account(s) skipped:`);
  problems.forEach((p) => console.log('  - ' + p));
}
