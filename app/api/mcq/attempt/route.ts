import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { attemptByToken, attemptView, currentView, finishAttempt, isOverdue } from '../../../../utils/mcq-server';
import { cleanAnswers } from '../../../../utils/mcq';

// The attempt token (a long random string the exam page keeps) is the key to one attempt.

// GET ?token= — the running exam (questions, saved answers, deadline) or, once submitted, the result.
export async function GET(request: Request) {
  const admin = createAdminClient();
  const attempt = await attemptByToken(admin, new URL(request.url).searchParams.get('token'));
  if (!attempt) return NextResponse.json({ error: 'Exam attempt not found.' }, { status: 404 });
  return NextResponse.json(await currentView(admin, attempt));
}

// POST { token, answers, submit?, auto? } — saves answers as the student goes; submit grades them.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const attempt = await attemptByToken(admin, body.token);
  if (!attempt) return NextResponse.json({ error: 'Exam attempt not found.' }, { status: 404 });
  if (attempt.submitted_at) return NextResponse.json(attemptView(attempt));

  // Too late: the answers sent now don't count; the last saved ones are graded.
  if (isOverdue(attempt)) return NextResponse.json(await currentView(admin, attempt));

  const answers = cleanAnswers(body.answers, attempt.mcq_exams.questions);
  if (body.submit) {
    return NextResponse.json(attemptView(await finishAttempt(admin, attempt, answers, Boolean(body.auto))));
  }
  await admin.from('mcq_attempts').update({ answers }).eq('id', attempt.id).is('submitted_at', null);
  return NextResponse.json({ saved: true });
}
