import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { createClient } from '../../../../utils/supabase-server';
import { attemptByToken, currentView, normaliseRoll, signedInStudent, studentRoll, type AttemptRow } from '../../../../utils/mcq-server';
import { shuffledOrder, type McqExam } from '../../../../utils/mcq';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Start (or resume) an attempt. Students of the exam's semester are recognised by their login;
// everyone else needs the exam password, their name and their roll. One attempt per roll.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.toLowerCase() : '';
  const admin = createAdminClient();
  const { data: exam } = await admin.from('mcq_exams').select('*').eq('code', code).maybeSingle<McqExam>();
  if (!exam || exam.status === 'draft') return fail('This exam link is not valid.', 404);

  const student = await signedInStudent(await createClient(), admin);
  const ownSemester = Boolean(student && exam.semester !== null && exam.semester === student.semester);

  let roll: string, name: string;
  if (student) {
    // Signed-in students always sit as themselves; other semesters still need the password.
    roll = studentRoll(student);
    name = student.name;
  } else {
    roll = normaliseRoll(body.roll);
    name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    if (!name) return fail('Enter your name.');
    if (!/^[A-Za-z0-9-]{3,30}$/.test(roll)) return fail('Enter your roll (letters and digits only).');
  }
  if (!ownSemester && body.password !== exam.password) return fail('The exam password is not correct.', 403);

  const { data: existing } = await admin.from('mcq_attempts').select('*, mcq_exams(*)').eq('exam_id', exam.id).eq('roll', roll).maybeSingle<AttemptRow>();
  if (existing) {
    if (existing.blocked && !existing.submitted_at) return fail('You were blocked from this exam for leaving the page. Ask the HOD to unblock you.', 403);
    // Resume only on the same device (its saved token) or as the signed-in student it belongs to.
    const sameDevice = typeof body.token === 'string' && body.token === existing.token;
    if (!sameDevice && !student) {
      return fail(existing.submitted_at
        ? 'This roll has already taken this exam. Ask the HOD if it needs to be reset.'
        : 'This roll has already started this exam on another device. Continue there, or ask the HOD to reset it.', 409);
    }
    return NextResponse.json({ token: existing.token, view: await currentView(admin, existing) });
  }

  if (exam.status !== 'open') return fail('This exam is closed.', 403);

  const token = randomBytes(24).toString('hex');
  const deadline = new Date(Date.now() + exam.duration_minutes * 60_000).toISOString();
  const { error } = await admin.from('mcq_attempts').insert({
    exam_id: exam.id, student_id: student?.id ?? null, roll, name, token, deadline,
    question_order: exam.shuffle ? shuffledOrder(exam.questions.length) : null,
    answers: exam.questions.map(() => null),
  });
  if (error) {
    // Two taps at once: the unique (exam, roll) rule lets only one in.
    if (error.code === '23505') return fail('This roll has already started this exam.', 409);
    console.error('mcq join', error);
    return fail('Could not start the exam. Try again.', 500);
  }
  const attempt = await attemptByToken(admin, token);
  if (!attempt) return fail('Could not start the exam. Try again.', 500);
  return NextResponse.json({ token, view: await currentView(admin, attempt) });
}
