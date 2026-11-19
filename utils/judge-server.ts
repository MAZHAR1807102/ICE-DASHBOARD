import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LANGUAGES, SUBMIT_GRACE_SECONDS, allCases, gradeCases, isFinal, personalDeadline, standings,
  type CaseResult, type JudgeCase, type JudgeParticipant, type JudgeProblem, type JudgeSubmission, type JudgeTest,
  type LanguageId, type ShownProblem,
} from './judge';

// Server-only helpers for /api/judge/*. They run with the service-role client, so every route checks
// who is asking first. Hidden test cases never leave the server (except to the judge server).

// ---------------------------------------------------------------------------------------------
// The judge server (Judge0). Configured with environment variables on Vercel:
//   JUDGE0_URL          e.g. http://203.0.113.10:2358  (our own server) or https://judge0-ce.p.rapidapi.com
//   JUDGE0_AUTH_TOKEN   the X-Auth-Token set on our own server (optional)
//   JUDGE0_RAPIDAPI_KEY when using the hosted RapidAPI service (optional)
// Without JUDGE0_URL, submissions are kept as "waiting for the judge" and judged once it is set.
// ---------------------------------------------------------------------------------------------
const BATCH = 20; // Judge0's default largest batch

export const judgeConfigured = () => Boolean(process.env.JUDGE0_URL);

function judgeFetch(path: string, init?: RequestInit) {
  const base = process.env.JUDGE0_URL!.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.JUDGE0_RAPIDAPI_KEY) {
    headers['X-RapidAPI-Key'] = process.env.JUDGE0_RAPIDAPI_KEY;
    headers['X-RapidAPI-Host'] = new URL(base).host;
  } else if (process.env.JUDGE0_AUTH_TOKEN) {
    headers['X-Auth-Token'] = process.env.JUDGE0_AUTH_TOKEN;
  }
  return fetch(`${base}${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(25_000) });
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

type Limits = { time_limit_ms: number; memory_mb: number };
const runSettings = (language: LanguageId, limits: Limits) => {
  const seconds = (limits.time_limit_ms / 1000) * LANGUAGES[language].timeFactor;
  return {
    language_id: LANGUAGES[language].judge0,
    cpu_time_limit: seconds,
    wall_time_limit: Math.min(20, seconds * 3 + 1),
    memory_limit: Math.max(limits.memory_mb, language === 'java' ? 256 : 0) * 1024,
  };
};

// Sends one run per test case; returns the judge's tokens (in case order).
export async function startRuns(language: LanguageId, source: string, cases: JudgeCase[], limits: Limits): Promise<string[]> {
  const tokens: string[] = [];
  for (let i = 0; i < cases.length; i += BATCH) {
    const submissions = cases.slice(i, i + BATCH).map((c) => ({ ...runSettings(language, limits), source_code: b64(source), stdin: b64(c.input) }));
    const res = await judgeFetch('/submissions/batch?base64_encoded=true', { method: 'POST', body: JSON.stringify({ submissions }) });
    if (!res.ok) throw new Error(`Judge server answered ${res.status}`);
    const body = (await res.json()) as { token?: string; error?: string }[];
    if (body.some((b) => !b.token)) throw new Error('The judge server refused a run.');
    tokens.push(...body.map((b) => b.token!));
  }
  return tokens;
}

type RawResult = { status?: { id: number }; status_id?: number; stdout: string | null; stderr: string | null; compile_output: string | null; time: string | null; memory: number | null; message: string | null };
const toCase = (r: RawResult): CaseResult => ({
  status: r.status?.id ?? r.status_id ?? 13,
  stdout: unb64(r.stdout), stderr: unb64(r.stderr), compile: unb64(r.compile_output), message: unb64(r.message),
  time: r.time === null ? null : Number(r.time), memory: r.memory,
});

// The results so far for these tokens (status 1–2 = still waiting).
export async function fetchRuns(tokens: string[]): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (let i = 0; i < tokens.length; i += BATCH) {
    const res = await judgeFetch(`/submissions/batch?tokens=${tokens.slice(i, i + BATCH).join(',')}&base64_encoded=true&fields=status,stdout,stderr,compile_output,time,memory,message`);
    if (!res.ok) throw new Error(`Judge server answered ${res.status}`);
    const body = (await res.json()) as { submissions: RawResult[] };
    out.push(...body.submissions.map(toCase));
  }
  return out;
}

// One run with the student's own input, waiting for the answer (the "Run" button).
export async function runOnce(language: LanguageId, source: string, input: string, limits: Limits): Promise<CaseResult> {
  const res = await judgeFetch('/submissions?base64_encoded=true&wait=true', {
    method: 'POST', body: JSON.stringify({ ...runSettings(language, limits), source_code: b64(source), stdin: b64(input) }),
  });
  if (!res.ok) throw new Error(`Judge server answered ${res.status}`);
  return toCase((await res.json()) as RawResult);
}

export async function judgeReachable() {
  if (!judgeConfigured()) return false;
  try {
    return (await judgeFetch('/about')).ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Judging a submission. Safe to call from any request, any number of times: a pending submission
// is claimed (pending → running) by exactly one caller, which sends it to the judge.
// ---------------------------------------------------------------------------------------------
type SubmissionRow = JudgeSubmission & { judge_tokens: string[] | null };
const STUCK_MS = 10 * 60_000;

export async function processSubmission(admin: SupabaseClient, sub: SubmissionRow, problem?: JudgeProblem | null): Promise<SubmissionRow> {
  if (isFinal(sub.status) || !judgeConfigured()) return sub;
  const p = problem ?? (await admin.from('judge_problems').select('*').eq('id', sub.problem_id).maybeSingle<JudgeProblem>()).data;
  if (!p) return sub;
  const cases = allCases(p);

  if (sub.status === 'running' && !sub.judge_tokens) {
    // Claimed but never sent (that request died): free it again after a while.
    if (Date.now() - new Date(sub.created_at).getTime() > 120_000) {
      await admin.from('judge_submissions').update({ status: 'pending' }).eq('id', sub.id).eq('status', 'running').is('judge_tokens', null);
    }
    return sub;
  }
  if (sub.status === 'pending') {
    const { data: claimed } = await admin.from('judge_submissions').update({ status: 'running' }).eq('id', sub.id).eq('status', 'pending').select('id').maybeSingle();
    if (!claimed) return sub; // someone else is sending it
    try {
      const tokens = await startRuns(sub.language, sub.source, cases, p);
      const { data } = await admin.from('judge_submissions').update({ judge_tokens: tokens }).eq('id', sub.id).select('*').maybeSingle<SubmissionRow>();
      return data ?? sub;
    } catch (err) {
      console.error('judge start', err);
      await admin.from('judge_submissions').update({ status: 'pending' }).eq('id', sub.id);
      return { ...sub, status: 'pending' };
    }
  }

  try {
    const results = await fetchRuns(sub.judge_tokens!);
    const graded = gradeCases(results, cases, sub.points);
    if (!graded) {
      if (Date.now() - new Date(sub.created_at).getTime() > STUCK_MS) {
        const { data } = await admin.from('judge_submissions').update({ status: 'IE', message: 'The judge did not answer in time.', judged_at: new Date().toISOString() }).eq('id', sub.id).select('*').maybeSingle<SubmissionRow>();
        return data ?? sub;
      }
      return sub;
    }
    const { data } = await admin.from('judge_submissions').update({ ...graded, judged_at: new Date().toISOString() })
      .eq('id', sub.id).eq('status', 'running').select('*').maybeSingle<SubmissionRow>();
    return data ?? sub;
  } catch (err) {
    console.error('judge fetch', err);
    return sub;
  }
}

// ---------------------------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------------------------
export type ParticipantRow = JudgeParticipant & { token: string; last_submit_at: string | null; last_run_at: string | null; judge_tests: JudgeTest };

export async function participantByToken(admin: SupabaseClient, token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const { data } = await admin.from('judge_participants').select('*, judge_tests(*)').eq('token', token).maybeSingle<ParticipantRow>();
  return data;
}

export type ParticipantState = 'running' | 'finished' | 'blocked';
export function participantState(p: ParticipantRow, now = Date.now()): ParticipantState {
  if (p.blocked) return 'blocked';
  const deadline = personalDeadline(p.judge_tests, p.started_at);
  if (p.finished_at || p.judge_tests.status !== 'open' || (deadline !== null && now > deadline + SUBMIT_GRACE_SECONDS * 1000)) return 'finished';
  return 'running';
}

export async function testProblemsFor(admin: SupabaseClient, test: JudgeTest) {
  const ids = test.problems.map((p) => p.id);
  if (!ids.length) return [];
  const { data } = await admin.from('judge_problems').select('*').in('id', ids);
  const byId = new Map(((data ?? []) as JudgeProblem[]).map((p) => [p.id, p]));
  return test.problems.flatMap(({ id, points }) => (byId.has(id) ? [{ problem: byId.get(id)!, points }] : []));
}

// What the test page gets. Hidden cases are never included.
export type ShownSubmission = Pick<JudgeSubmission, 'id' | 'problem_id' | 'language' | 'status' | 'passed' | 'total' | 'score' | 'points' | 'time_ms' | 'memory_kb' | 'failed_test' | 'message' | 'created_at'>;
export const shownSubmission = (s: JudgeSubmission): ShownSubmission => ({
  id: s.id, problem_id: s.problem_id, language: s.language, status: s.status, passed: s.passed, total: s.total,
  score: s.score === null ? null : Number(s.score), points: s.points, time_ms: s.time_ms, memory_kb: s.memory_kb,
  failed_test: s.failed_test, message: s.message, created_at: s.created_at,
});

export type TestView = {
  state: ParticipantState;
  test: Pick<JudgeTest, 'title' | 'kind' | 'strict' | 'languages' | 'code'>;
  me: { name: string; roll: string; warnings: number };
  deadline: string | null;
  now: string;
  problems: ShownProblem[];
  submissions: ShownSubmission[];
  board: { roll: string; name: string; total: number; penalty: number; problems: { solved: boolean; score: number; tries: number }[]; me: boolean }[] | null;
  judgeReady: boolean;
};

export async function testView(admin: SupabaseClient, p: ParticipantRow): Promise<TestView> {
  const test = p.judge_tests;
  const state = participantState(p);
  const deadline = personalDeadline(test, p.started_at);
  const [problems, { data: subs }] = await Promise.all([
    state === 'blocked' ? Promise.resolve([]) : testProblemsFor(admin, test),
    admin.from('judge_submissions').select('*').eq('participant_id', p.id).order('created_at', { ascending: false }),
  ]);

  // A contest shows the live ranking to everyone taking it.
  let board: TestView['board'] = null;
  if (test.kind === 'contest' && state !== 'blocked') {
    const [{ data: people }, { data: all }] = await Promise.all([
      admin.from('judge_participants').select('id, roll, name, started_at, finished_at, warnings, violations, blocked, blocked_at, test_id, student_id').eq('test_id', test.id),
      admin.from('judge_submissions').select('participant_id, problem_id, status, score, created_at').eq('test_id', test.id),
    ]);
    board = standings(test, (people ?? []) as JudgeParticipant[], (all ?? []) as JudgeSubmission[]).map((s) => ({
      roll: s.participant.roll, name: s.participant.name, total: s.total, penalty: s.penalty, me: s.participant.id === p.id,
      problems: s.problems.map((x) => ({ solved: x.solved, score: x.score, tries: x.tries })),
    }));
  }

  return {
    state,
    test: { title: test.title, kind: test.kind, strict: test.strict, languages: test.languages, code: test.code },
    me: { name: p.name, roll: p.roll, warnings: p.warnings },
    deadline: deadline === null ? null : new Date(deadline).toISOString(),
    now: new Date().toISOString(),
    problems: problems.map(({ problem: x, points }) => ({
      id: x.id, title: x.title, statement: x.statement, input_format: x.input_format, output_format: x.output_format,
      samples: x.samples, time_limit_ms: x.time_limit_ms, memory_mb: x.memory_mb, points,
    })),
    submissions: ((subs ?? []) as JudgeSubmission[]).map(shownSubmission),
    board,
    judgeReady: judgeConfigured(),
  };
}

export const normaliseRoll = (roll: unknown) => (typeof roll === 'string' ? roll.replace(/\s+/g, '').slice(0, 30) : '');
