import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { judgeConfigured, participantByToken, participantState, runOnce } from '../../../../utils/judge-server';
import { VERDICTS, caseVerdict, isLanguage, type JudgeProblem } from '../../../../utils/judge';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// POST { token, problemId, language, source, input } — run the code once on the person's own input
// (not graded, not stored). One run every few seconds.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const p = await participantByToken(admin, body.token);
  if (!p) return fail('Not found.', 404);
  if (participantState(p) !== 'running') return fail('This test is over for you.', 403);
  if (!judgeConfigured()) return fail('The judge server is not connected yet — your teacher is setting it up. You can still submit; it will be judged later.', 503);
  if (!isLanguage(body.language) || !p.judge_tests.languages.includes(body.language)) return fail('Choose one of the allowed languages.');
  const source = typeof body.source === 'string' ? body.source : '';
  const input = typeof body.input === 'string' ? body.input.slice(0, 20000) : '';
  if (!source.trim() || source.length > 65536) return fail('Write your code first (up to 64 KB).');
  if (p.last_run_at && Date.now() - new Date(p.last_run_at).getTime() < 3000) return fail('Wait a few seconds between runs.', 429);
  const entry = p.judge_tests.problems.find((x) => x.id === body.problemId);
  const { data: problem } = entry ? await admin.from('judge_problems').select('time_limit_ms, memory_mb').eq('id', entry.id).maybeSingle<Pick<JudgeProblem, 'time_limit_ms' | 'memory_mb'>>() : { data: null };

  await admin.from('judge_participants').update({ last_run_at: new Date().toISOString() }).eq('id', p.id);
  try {
    const r = await runOnce(body.language, source, input, problem ?? { time_limit_ms: 2000, memory_mb: 256 });
    const v = caseVerdict(r, r.stdout);
    return NextResponse.json({
      verdict: v === 'AC' ? 'Ran' : VERDICTS[v].label, ok: v === 'AC',
      stdout: r.stdout.slice(0, 10000), stderr: r.stderr.slice(0, 4000), compile: r.compile.slice(0, 4000),
      time: r.time, memory: r.memory,
    });
  } catch (err) {
    console.error('judge run', err);
    return fail('The judge server did not answer. Try again in a moment.', 502);
  }
}
