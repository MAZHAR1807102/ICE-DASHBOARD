import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { requireRole } from '../../../../utils/supabase-server';
import { signedInStudent, studentRoll } from '../../../../utils/mcq-server';

// Student portal: open MCQ exams for the student's semester, and the exams they have taken.
export async function GET() {
  const auth = await requireRole(['student']);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient();
  const student = await signedInStudent(auth.supabase, admin);
  if (!student) return NextResponse.json({ open: [], taken: [] });
  const roll = studentRoll(student);

  const [{ data: open }, { data: attempts }] = await Promise.all([
    admin.from('mcq_exams').select('id, title, code, duration_minutes, questions')
      .eq('status', 'open').eq('semester', student.semester).order('opened_at', { ascending: false }),
    admin.from('mcq_attempts').select('exam_id, submitted_at, score, total, deadline, blocked, mcq_exams(title, code, status)')
      .eq('roll', roll).order('started_at', { ascending: false }).limit(20),
  ]);

  type Taken = { exam_id: string; submitted_at: string | null; score: number | null; total: number | null; deadline: string; blocked: boolean; mcq_exams: { title: string; code: string; status: string } | null };
  const taken = ((attempts ?? []) as unknown as Taken[]).filter((a) => a.mcq_exams);
  const started = new Set(taken.map((a) => a.exam_id));

  return NextResponse.json({
    open: (open ?? []).map((e) => ({
      title: e.title, code: e.code, duration: e.duration_minutes, count: (e.questions as unknown[]).length,
      started: started.has(e.id),
      blocked: taken.some((a) => a.exam_id === e.id && a.blocked && !a.submitted_at),
    })),
    taken: taken.map((a) => ({
      title: a.mcq_exams!.title, code: a.mcq_exams!.code,
      done: Boolean(a.submitted_at) || a.mcq_exams!.status === 'closed' || Date.now() > new Date(a.deadline).getTime() + 30_000,
      score: a.score, total: a.total, blocked: a.blocked,
    })),
  });
}
