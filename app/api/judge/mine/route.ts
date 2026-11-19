import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { requireRole } from '../../../../utils/supabase-server';
import { signedInStudent, studentRoll } from '../../../../utils/mcq-server';
import { KINDS, personalDeadline, standings, testPoints, type JudgeParticipant, type JudgeSubmission, type JudgeTest } from '../../../../utils/judge';

// Student portal: coding tests open for the student's semester (and whether they started them),
// and the tests they have taken with their marks / problems solved.
export async function GET() {
  const auth = await requireRole(['student']);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient();
  const student = await signedInStudent(auth.supabase, admin);
  if (!student) return NextResponse.json({ open: [], past: [] });
  const roll = studentRoll(student);

  const [{ data: openTests }, { data: mineRows }] = await Promise.all([
    admin.from('judge_tests').select('*').eq('status', 'open').eq('semester', student.semester).order('opened_at', { ascending: false }),
    admin.from('judge_participants').select('*, judge_tests(*)').eq('roll', roll).order('started_at', { ascending: false }).limit(30),
  ]);
  const mine = ((mineRows ?? []) as (JudgeParticipant & { judge_tests: JudgeTest | null })[]).filter((p) => p.judge_tests);
  const stateOf = (p: (typeof mine)[number]) => {
    const deadline = personalDeadline(p.judge_tests!, p.started_at);
    if (p.blocked) return 'blocked';
    if (p.finished_at || p.judge_tests!.status !== 'open' || (deadline !== null && Date.now() > deadline)) return 'finished';
    return 'started';
  };

  const { data: subs } = mine.length
    ? await admin.from('judge_submissions').select('participant_id, problem_id, status, score, created_at').in('participant_id', mine.map((p) => p.id))
    : { data: [] };

  return NextResponse.json({
    open: ((openTests ?? []) as JudgeTest[]).map((t) => {
      const p = mine.find((m) => m.test_id === t.id);
      return {
        title: t.title, code: t.code, kind: KINDS[t.kind].label, count: t.problems.length, duration: t.duration_minutes, endsAt: t.ends_at,
        state: p ? stateOf(p) : 'new',
      };
    }),
    past: mine.filter((p) => stateOf(p) !== 'started').map((p) => {
      const t = p.judge_tests!;
      const [row] = standings(t, [p], (subs ?? []) as JudgeSubmission[]);
      return {
        title: t.title, code: t.code, kind: KINDS[t.kind].label, contest: t.kind === 'contest', practice: t.kind === 'practice',
        total: row.total, outOf: t.kind === 'contest' || t.kind === 'practice' ? t.problems.length : testPoints(t),
        solved: row.problems.filter((x) => x.solved).length, blocked: p.blocked, at: p.started_at,
      };
    }),
  });
}
