import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { requireRole } from '../../../../utils/supabase-server';
import { finishAttempt, type AttemptRow } from '../../../../utils/mcq-server';
import { questionProblems, type McqExam } from '../../../../utils/mcq';

// HOD only: open or close an exam, or reset one person's attempt so they can sit it again.
// Closing grades every unfinished attempt with the answers saved so far.
export async function POST(request: Request) {
  const auth = await requireRole(['hod']);
  if ('error' in auth) return auth.error;
  const { supabase } = auth;
  const body = await request.json().catch(() => ({}));

  const { data: exam } = await supabase.from('mcq_exams').select('*').eq('id', body.id).maybeSingle<McqExam>();
  if (!exam) return NextResponse.json({ error: 'Exam not found.' }, { status: 404 });

  if (body.action === 'open') {
    const problems = questionProblems(exam.questions);
    if (problems.length) return NextResponse.json({ error: `Fix the questions first: ${problems[0]}` }, { status: 400 });
    const { error } = await supabase.from('mcq_exams').update({ status: 'open', opened_at: new Date().toISOString(), closed_at: null }).eq('id', exam.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'close') {
    const { error } = await supabase.from('mcq_exams').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', exam.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const admin = createAdminClient();
    const { data: running } = await admin.from('mcq_attempts').select('*, mcq_exams(*)').eq('exam_id', exam.id).is('submitted_at', null);
    for (const attempt of (running ?? []) as AttemptRow[]) await finishAttempt(admin, attempt, attempt.answers, true);
    return NextResponse.json({ ok: true, graded: running?.length ?? 0 });
  }

  // Strict mode: let a blocked person continue (their timer kept running); warnings start again.
  if (body.action === 'unblock' && typeof body.attemptId === 'string') {
    const { error } = await supabase.from('mcq_attempts').update({ blocked: false, blocked_at: null, warnings: 0 }).eq('id', body.attemptId).eq('exam_id', exam.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reset' && typeof body.attemptId === 'string') {
    const { error } = await supabase.from('mcq_attempts').delete().eq('id', body.attemptId).eq('exam_id', exam.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
