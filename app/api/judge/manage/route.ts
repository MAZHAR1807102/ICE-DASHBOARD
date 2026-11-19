import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { requireRole } from '../../../../utils/supabase-server';
import { TEACHER_PORTAL_ROLES } from '../../../../utils/auth';
import { processSubmission } from '../../../../utils/judge-server';
import { testProblems, type JudgeProblem, type JudgeSubmission, type JudgeTest } from '../../../../utils/judge';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Teachers, on their own tests (the HOD on all — RLS decides which tests they can see):
// open / close a test, reset someone (delete their place and submissions), rejudge a submission,
// judge whatever is waiting. Unblocking someone is for the HOD only.
export async function POST(request: Request) {
  const auth = await requireRole(TEACHER_PORTAL_ROLES);
  if ('error' in auth) return auth.error;
  const { supabase, role } = auth;
  const body = await request.json().catch(() => ({}));
  const { data: test } = await supabase.from('judge_tests').select('*').eq('id', body.id).maybeSingle<JudgeTest>();
  if (!test) return fail('Test not found.', 404);
  const admin = createAdminClient();

  if (body.action === 'open') {
    const { data: bank } = await supabase.from('judge_problems').select('id, title, samples, tests').in('id', test.problems.map((p) => p.id));
    const problems = testProblems(test, (bank ?? []) as JudgeProblem[]);
    if (problems.length) return fail(`Fix the test first: ${problems[0]}`);
    const { error } = await supabase.from('judge_tests').update({ status: 'open', opened_at: new Date().toISOString(), closed_at: null }).eq('id', test.id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (body.action === 'close') {
    const { error } = await supabase.from('judge_tests').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', test.id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (body.action === 'unblock' && typeof body.participantId === 'string') {
    if (role !== 'hod') return fail('Only the HOD can unblock a student.', 403);
    // Unblocked with a clean slate of warnings — the record of what happened stays in violations.
    const { error } = await admin.from('judge_participants').update({ blocked: false, blocked_at: null, warnings: 0 }).eq('id', body.participantId).eq('test_id', test.id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (body.action === 'reset' && typeof body.participantId === 'string') {
    const { data: p } = await admin.from('judge_participants').select('blocked').eq('id', body.participantId).eq('test_id', test.id).maybeSingle();
    if (p?.blocked && role !== 'hod') return fail('This student is blocked — only the HOD can let them back in.', 403);
    const { error } = await admin.from('judge_participants').delete().eq('id', body.participantId).eq('test_id', test.id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (body.action === 'rejudge' && typeof body.submissionId === 'string') {
    const { data: sub } = await admin.from('judge_submissions')
      .update({ status: 'pending', judge_tokens: null, passed: null, total: null, score: null, time_ms: null, memory_kb: null, failed_test: null, message: null, judged_at: null })
      .eq('id', body.submissionId).eq('test_id', test.id).select('*').maybeSingle();
    if (!sub) return fail('Submission not found.', 404);
    return NextResponse.json({ ok: true, submission: await processSubmission(admin, sub as JudgeSubmission & { judge_tokens: string[] | null }) });
  }

  if (body.action === 'process') {
    const { data: waiting } = await admin.from('judge_submissions').select('*').eq('test_id', test.id).in('status', ['pending', 'running']).order('created_at').limit(25);
    let judged = 0;
    for (const sub of (waiting ?? []) as (JudgeSubmission & { judge_tokens: string[] | null })[]) {
      const after = await processSubmission(admin, sub);
      if (after.status !== sub.status) judged++;
    }
    return NextResponse.json({ ok: true, waiting: waiting?.length ?? 0, judged });
  }

  return fail('Unknown action.');
}
