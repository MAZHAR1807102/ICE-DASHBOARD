import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { TEACHER_PORTAL_ROLES } from '../../../../utils/auth';
import { fetchRuns, judgeConfigured, startRuns } from '../../../../utils/judge-server';
import { VERDICTS, caseVerdict, isLanguage, type JudgeCase } from '../../../../utils/judge';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const cleanCases = (v: unknown): JudgeCase[] => (Array.isArray(v) ? v : []).slice(0, 100).map((c) => ({ input: String(c?.input ?? ''), output: String(c?.output ?? '') }));

// Teachers: run a model solution on a problem's cases while writing it.
// POST { language, source, cases, time_limit_ms, memory_mb } → { tokens }
// POST { tokens, cases } → { done, results: [{ verdict, time }] }
export async function POST(request: Request) {
  const auth = await requireRole(TEACHER_PORTAL_ROLES);
  if ('error' in auth) return auth.error;
  if (!judgeConfigured()) return fail('The judge server is not connected yet.', 503);
  const body = await request.json().catch(() => ({}));
  const cases = cleanCases(body.cases);
  try {
    if (Array.isArray(body.tokens)) {
      const tokens = body.tokens.filter((t: unknown) => typeof t === 'string' && /^[a-f0-9-]{20,60}$/.test(t)).slice(0, 100);
      const results = await fetchRuns(tokens);
      const verdicts = results.map((r, i) => caseVerdict(r, cases[i]?.output ?? ''));
      return NextResponse.json({
        done: verdicts.every((v) => v !== 'running'),
        results: results.map((r, i) => ({ verdict: verdicts[i], label: VERDICTS[verdicts[i]].label, time: r.time, output: r.stdout.slice(0, 2000), error: (r.compile || r.stderr).slice(0, 2000) })),
      });
    }
    if (!isLanguage(body.language)) return fail('Choose a language.');
    const source = typeof body.source === 'string' ? body.source : '';
    if (!source.trim() || source.length > 65536) return fail('Paste the solution first.');
    if (!cases.length) return fail('Add some test cases first.');
    const limits = { time_limit_ms: Math.min(10000, Math.max(100, Number(body.time_limit_ms) || 1000)), memory_mb: Math.min(1024, Math.max(16, Number(body.memory_mb) || 256)) };
    return NextResponse.json({ tokens: await startRuns(body.language, source, cases, limits) });
  } catch (err) {
    console.error('judge check', err);
    return fail('The judge server did not answer. Try again in a moment.', 502);
  }
}
