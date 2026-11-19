import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { judgeConfigured, participantByToken, participantState, processSubmission, shownSubmission } from '../../../../utils/judge-server';
import { isLanguage, type JudgeSubmission } from '../../../../utils/judge';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// POST { token, problemId, language, source } — submit a solution: stored, then sent to the judge.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const p = await participantByToken(admin, body.token);
  if (!p) return fail('Not found.', 404);
  const state = participantState(p);
  if (state === 'blocked') return fail('You are blocked from this test.', 403);
  if (state !== 'running') return fail('This test is over for you — no more submissions.', 403);
  const entry = p.judge_tests.problems.find((x) => x.id === body.problemId);
  if (!entry) return fail('That problem is not in this test.');
  if (!isLanguage(body.language) || !p.judge_tests.languages.includes(body.language)) return fail('Choose one of the allowed languages.');
  const source = typeof body.source === 'string' ? body.source : '';
  if (!source.trim()) return fail('Write your code first.');
  if (source.length > 65536) return fail('The code is too long (64 KB at most).');
  if (p.last_submit_at && Date.now() - new Date(p.last_submit_at).getTime() < 5000) return fail('Wait a few seconds between submissions.', 429);
  if (judgeConfigured()) {
    const { count } = await admin.from('judge_submissions').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).in('status', ['pending', 'running']);
    if (count) return fail('Your last submission is still being judged — wait for its result.', 429);
  }

  await admin.from('judge_participants').update({ last_submit_at: new Date().toISOString() }).eq('id', p.id);
  const { data: sub, error } = await admin.from('judge_submissions')
    .insert({ test_id: p.test_id, participant_id: p.id, problem_id: entry.id, language: body.language, source, points: entry.points })
    .select('*').single();
  if (error || !sub) {
    console.error('judge submit', error);
    return fail('Could not save the submission. Try again.', 500);
  }
  const sent = await processSubmission(admin, sub as JudgeSubmission & { judge_tokens: string[] | null });
  return NextResponse.json(shownSubmission(sent));
}
