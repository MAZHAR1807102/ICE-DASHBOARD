import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { requireRole } from '../../../../utils/supabase-server';
import { signedInStudent, studentRoll } from '../../../../utils/mcq-server';
import { KINDS, type JudgeTest } from '../../../../utils/judge';

// Student portal: coding tests open for the student's semester, and whether they have started them.
export async function GET() {
  const auth = await requireRole(['student']);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient();
  const student = await signedInStudent(auth.supabase, admin);
  if (!student) return NextResponse.json({ open: [] });
  const roll = studentRoll(student);
  const { data: tests } = await admin.from('judge_tests').select('*').eq('status', 'open').eq('semester', student.semester).order('opened_at', { ascending: false });
  const list = (tests ?? []) as JudgeTest[];
  const { data: mine } = list.length ? await admin.from('judge_participants').select('test_id, finished_at, blocked').eq('roll', roll).in('test_id', list.map((t) => t.id)) : { data: [] };
  return NextResponse.json({
    open: list.map((t) => {
      const p = (mine ?? []).find((m) => m.test_id === t.id);
      return {
        title: t.title, code: t.code, kind: KINDS[t.kind].label, count: t.problems.length, duration: t.duration_minutes, endsAt: t.ends_at,
        state: !p ? 'new' : p.blocked ? 'blocked' : p.finished_at ? 'finished' : 'started',
      };
    }),
  });
}
