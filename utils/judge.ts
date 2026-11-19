// Online judge: problem/test types, languages, verdicts, output checking, scoring.
// Pure functions — shared by the teacher screens, the test page and the /api/judge routes.

export type JudgeCase = { input: string; output: string };

export type JudgeProblem = {
  id: string;
  title: string;
  statement: string;
  input_format: string;
  output_format: string;
  samples: JudgeCase[]; // shown to students
  tests: JudgeCase[]; // hidden
  time_limit_ms: number;
  memory_mb: number;
  created_by: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
};

export type TestKind = 'lab' | 'exam' | 'assignment' | 'practice' | 'contest';
export type TestStatus = 'draft' | 'open' | 'closed';

export type JudgeTest = {
  id: string;
  title: string;
  kind: TestKind;
  semester: number | null; // null = link + password only
  status: TestStatus;
  code: string;
  password: string;
  languages: LanguageId[];
  duration_minutes: number | null; // each person's timer, from when they start
  ends_at: string | null; // deadline for everyone
  strict: boolean; // no copy/paste; leaving the page once = warning, twice = blocked
  problems: { id: string; points: number }[];
  created_by: string | null;
  author_name: string;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
};

export type Violation = { at: string; kind: string };

export type JudgeParticipant = {
  id: string;
  test_id: string;
  student_id: string | null;
  roll: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  warnings: number;
  violations: Violation[];
  blocked: boolean;
  blocked_at: string | null;
};

export type Verdict = 'pending' | 'running' | 'AC' | 'WA' | 'TLE' | 'RE' | 'CE' | 'IE';

export type JudgeSubmission = {
  id: string;
  test_id: string;
  participant_id: string;
  problem_id: string;
  language: LanguageId;
  source: string;
  status: Verdict;
  passed: number | null;
  total: number | null;
  points: number;
  score: number | null;
  time_ms: number | null;
  memory_kb: number | null;
  failed_test: number | null;
  message: string | null;
  created_at: string;
  judged_at: string | null;
};

// ---------- Languages (Judge0 language ids) ----------
export type LanguageId = 'c' | 'cpp' | 'java';
export const LANGUAGES: Record<LanguageId, { label: string; judge0: number; timeFactor: number; starter: string }> = {
  c: {
    label: 'C', judge0: 50, timeFactor: 1,
    starter: '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n',
  },
  cpp: {
    label: 'C++', judge0: 54, timeFactor: 1,
    starter: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  },
  java: {
    // Judge0 runs Java from a file named Main.java, so the class must be called Main.
    label: 'Java', judge0: 62, timeFactor: 2,
    starter: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        \n    }\n}\n',
  },
};
export const LANGUAGE_IDS = Object.keys(LANGUAGES) as LanguageId[];
export const isLanguage = (v: unknown): v is LanguageId => typeof v === 'string' && v in LANGUAGES;

// ---------- Verdicts ----------
export const VERDICTS: Record<Verdict, { label: string; tone: 'slate' | 'emerald' | 'rose' | 'amber' | 'violet' | 'sky' }> = {
  pending: { label: 'Waiting for the judge', tone: 'slate' },
  running: { label: 'Judging…', tone: 'sky' },
  AC: { label: 'Accepted', tone: 'emerald' },
  WA: { label: 'Wrong answer', tone: 'rose' },
  TLE: { label: 'Time limit exceeded', tone: 'amber' },
  RE: { label: 'Runtime error', tone: 'violet' },
  CE: { label: 'Compilation error', tone: 'amber' },
  IE: { label: 'Judge error', tone: 'slate' },
};
export const isFinal = (v: Verdict) => v !== 'pending' && v !== 'running';

export const KINDS: Record<TestKind, { label: string; hint: string }> = {
  lab: { label: 'Lab test', hint: 'Timed, marks per test case passed' },
  exam: { label: 'Exam', hint: 'Timed, marks per test case passed' },
  assignment: { label: 'Assignment', hint: 'Open until the deadline, marks per test case passed' },
  practice: { label: 'Practice', hint: 'Always open while it is open, no marks' },
  contest: { label: 'Contest', hint: 'Live ranking: problems solved, then least penalty time' },
};

// ---------- Output checking ----------
// Line endings, spaces at line ends and blank lines at the end are ignored; everything else must match.
export function sameOutput(got: string, expected: string) {
  const norm = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
  return norm(got) === norm(expected);
}

// Judge0 statuses: 1 queued, 2 processing, 3 ran fine, 4 wrong answer (unused — we compare
// ourselves), 5 time limit, 6 compilation error, 7–12 runtime errors, 13 internal, 14 exec format.
export type CaseResult = { status: number; stdout: string; stderr: string; compile: string; time: number | null; memory: number | null; message: string };
export function caseVerdict(r: CaseResult, expected: string): Verdict {
  if (r.status <= 2) return 'running';
  if (r.status === 6) return 'CE';
  if (r.status === 5) return 'TLE';
  if (r.status >= 7 && r.status <= 12) return 'RE';
  if (r.status === 3 || r.status === 4) return sameOutput(r.stdout, expected) ? 'AC' : 'WA';
  return 'IE';
}

// The whole submission: the first case that fails decides the verdict; marks are the share passed.
export function gradeCases(results: CaseResult[], cases: JudgeCase[], points: number) {
  const verdicts = results.map((r, i) => caseVerdict(r, cases[i]?.output ?? ''));
  if (verdicts.some((v) => v === 'running')) return null;
  const passed = verdicts.filter((v) => v === 'AC').length;
  const firstBad = verdicts.findIndex((v) => v !== 'AC');
  const status: Verdict = verdicts.includes('CE') ? 'CE' : firstBad < 0 ? 'AC' : verdicts[firstBad];
  const compile = results.find((r) => r.compile)?.compile ?? '';
  return {
    status,
    passed: status === 'CE' ? 0 : passed,
    total: cases.length,
    score: status === 'CE' || !cases.length ? 0 : Math.round((points * passed * 100) / cases.length) / 100,
    failed_test: firstBad < 0 || status === 'CE' ? null : firstBad + 1,
    time_ms: Math.round(Math.max(0, ...results.map((r) => r.time ?? 0)) * 1000),
    memory_kb: Math.max(0, ...results.map((r) => r.memory ?? 0)),
    message: status === 'CE' ? compile.slice(0, 4000) : status === 'RE' ? (results[firstBad]?.stderr || results[firstBad]?.message || '').slice(0, 1000) : null,
  };
}

// A problem is judged on its samples first, then its hidden cases.
export const allCases = (p: Pick<JudgeProblem, 'samples' | 'tests'>) => [...p.samples, ...p.tests];

// ---------- Time ----------
export const SUBMIT_GRACE_SECONDS = 30;
// When this person's time is up: their own timer or the test's deadline, whichever comes first.
export function personalDeadline(test: Pick<JudgeTest, 'duration_minutes' | 'ends_at'>, startedAt: string): number | null {
  const times = [
    test.duration_minutes ? new Date(startedAt).getTime() + test.duration_minutes * 60_000 : null,
    test.ends_at ? new Date(test.ends_at).getTime() : null,
  ].filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}

// Timed tests (lab, exam, contest) can't be left and come back to: closing the page counts as leaving.
export const isTimedKind = (kind: TestKind) => kind === 'lab' || kind === 'exam' || kind === 'contest';

// ---------- Scoring ----------
export type Standing = {
  participant: JudgeParticipant;
  problems: { problemId: string; score: number; solved: boolean; tries: number; minutes: number | null; pending: boolean }[];
  total: number; // marks (points tests) or problems solved (contest)
  penalty: number; // contest only: minutes to each first Accepted + 20 per wrong try before it
};

// Best submission per problem counts (marks); for a contest, solved + penalty like ICPC.
export function standings(test: Pick<JudgeTest, 'kind' | 'problems'>, participants: JudgeParticipant[], submissions: Pick<JudgeSubmission, 'participant_id' | 'problem_id' | 'status' | 'score' | 'created_at'>[]): Standing[] {
  const rows = participants.map((p) => {
    const mine = submissions.filter((s) => s.participant_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const problems = test.problems.map(({ id }) => {
      const subs = mine.filter((s) => s.problem_id === id);
      const firstAc = subs.findIndex((s) => s.status === 'AC');
      const counted = (firstAc < 0 ? subs : subs.slice(0, firstAc)).filter((s) => isFinal(s.status) && s.status !== 'CE' && s.status !== 'IE');
      return {
        problemId: id,
        score: Math.max(0, ...subs.map((s) => Number(s.score ?? 0))),
        solved: firstAc >= 0,
        tries: counted.length + (firstAc >= 0 ? 1 : 0),
        minutes: firstAc >= 0 ? Math.floor((new Date(subs[firstAc].created_at).getTime() - new Date(p.started_at).getTime()) / 60_000) : null,
        pending: subs.some((s) => !isFinal(s.status)),
      };
    });
    const contest = test.kind === 'contest';
    return {
      participant: p,
      problems,
      total: contest ? problems.filter((x) => x.solved).length : Math.round(problems.reduce((s, x) => s + x.score, 0) * 100) / 100,
      penalty: contest ? problems.reduce((s, x) => s + (x.solved ? (x.minutes ?? 0) + 20 * (x.tries - 1) : 0), 0) : 0,
    };
  });
  return rows.sort((a, b) => b.total - a.total || a.penalty - b.penalty || a.participant.roll.localeCompare(b.participant.roll));
}

export const testPoints = (test: Pick<JudgeTest, 'problems'>) => test.problems.reduce((s, p) => s + p.points, 0);

// Problems shown to students: statement and samples, never the hidden cases.
export type ShownProblem = Pick<JudgeProblem, 'id' | 'title' | 'statement' | 'input_format' | 'output_format' | 'samples' | 'time_limit_ms' | 'memory_mb'> & { points: number };

export const newTestCode = () => randomFrom('abcdefghjkmnpqrstuvwxyz23456789', 8);
export const newTestPassword = () => randomFrom('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
function randomFrom(alphabet: string, length: number) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// Problems that stop a test from opening.
export function testProblems(test: Pick<JudgeTest, 'problems' | 'languages'>, bank: Pick<JudgeProblem, 'id' | 'title' | 'samples' | 'tests'>[]) {
  const out: string[] = [];
  if (!test.problems.length) out.push('Add at least one problem.');
  if (!test.languages.length) out.push('Allow at least one language.');
  for (const { id } of test.problems) {
    const p = bank.find((b) => b.id === id);
    if (!p) out.push('A problem in this test has been deleted from the problem bank.');
    else if (!allCases(p).length) out.push(`"${p.title}" has no test cases.`);
  }
  return out;
}
