import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { createClient } from '../../../../utils/supabase-server';
import { signedInStudent, studentRoll } from '../../../../utils/mcq-server';
import type { McqExam } from '../../../../utils/mcq';

// Public: what the exam page shows before someone joins — never the questions or the password.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')?.toLowerCase() ?? '';
  if (!/^[a-z0-9]{6,16}$/.test(code)) return NextResponse.json({ error: 'This exam link is not valid.' }, { status: 404 });

  const admin = createAdminClient();
  const { data: exam } = await admin.from('mcq_exams').select('*').eq('code', code).maybeSingle<McqExam>();
  if (!exam || exam.status === 'draft') return NextResponse.json({ error: 'This exam link is not valid, or the exam has not been opened yet.' }, { status: 404 });

  // A signed-in student of the exam's semester joins without the password, as themselves.
  const student = await signedInStudent(await createClient(), admin);
  let me = null;
  if (student) {
    const roll = studentRoll(student);
    const { data: attempt } = await admin.from('mcq_attempts').select('token, submitted_at, blocked').eq('exam_id', exam.id).eq('roll', roll).maybeSingle();
    me = {
      name: student.name, roll,
      ownSemester: exam.semester !== null && exam.semester === student.semester,
      token: attempt?.token ?? null, submitted: Boolean(attempt?.submitted_at),
      blocked: Boolean(attempt?.blocked && !attempt.submitted_at),
    };
  }

  return NextResponse.json({
    title: exam.title, semester: exam.semester, duration: exam.duration_minutes,
    count: exam.questions.length, status: exam.status, strict: exam.strict, me,
  });
}
