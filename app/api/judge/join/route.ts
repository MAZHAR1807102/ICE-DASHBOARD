import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { createClient } from '../../../../utils/supabase-server';
import { signedInStudent, studentRoll } from '../../../../utils/mcq-server';
import { normaliseRoll, participantByToken, testView } from '../../../../utils/judge-server';
import { personalDeadline, type JudgeTest } from '../../../../utils/judge';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const BLOCKED = 'You were blocked from this test for leaving the page. Ask the HOD to unblock you.';

// Start (or come back to) a test. Students of the test's semester are recognised by their login;
// everyone else needs the test password, their name and their roll. One place per roll.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.toLowerCase() : '';
  const admin = createAdminClient();
  const { data: test } = await admin.from('judge_tests').select('*').eq('code', code).maybeSingle<JudgeTest>();
  if (!test || test.status === 'draft') return fail('This test link is not valid.', 404);

  const student = await signedInStudent(await createClient(), admin);
  const ownSemester = Boolean(student && test.semester !== null && test.semester === student.semester);
  let roll: string, name: string;
  if (student) {
    roll = studentRoll(student);
    name = student.name;
  } else {
    roll = normaliseRoll(body.roll);
    name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    if (!name) return fail('Enter your name.');
    if (!/^[A-Za-z0-9-]{3,30}$/.test(roll)) return fail('Enter your roll (letters and digits only).');
  }
  if (!ownSemester && body.password !== test.password) return fail('The test password is not correct.', 403);

  const { data: existing } = await admin.from('judge_participants').select('id, token, blocked').eq('test_id', test.id).eq('roll', roll).maybeSingle();
  if (existing) {
    if (existing.blocked) return fail(BLOCKED, 403);
    // Come back only on the same device (its saved token) or as the signed-in student it belongs to.
    const sameDevice = typeof body.token === 'string' && body.token === existing.token;
    if (!sameDevice && !student) return fail('This roll has already started this test on another device. Continue there, or ask your teacher to reset it.', 409);
    const p = await participantByToken(admin, existing.token);
    return NextResponse.json({ token: existing.token, view: await testView(admin, p!) });
  }

  if (test.status !== 'open') return fail('This test is closed.', 403);
  const deadline = personalDeadline({ duration_minutes: null, ends_at: test.ends_at }, new Date().toISOString());
  if (deadline !== null && Date.now() > deadline) return fail('The deadline for this test has passed.', 403);

  const token = randomBytes(24).toString('hex');
  const { error } = await admin.from('judge_participants').insert({ test_id: test.id, student_id: student?.id ?? null, roll, name, token });
  if (error) {
    if (error.code === '23505') return fail('This roll has already started this test.', 409);
    console.error('judge join', error);
    return fail('Could not start the test. Try again.', 500);
  }
  const p = await participantByToken(admin, token);
  if (!p) return fail('Could not start the test. Try again.', 500);
  return NextResponse.json({ token, view: await testView(admin, p) });
}
