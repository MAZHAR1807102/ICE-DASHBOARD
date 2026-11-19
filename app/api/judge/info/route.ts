import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { createClient } from '../../../../utils/supabase-server';
import { signedInStudent, studentRoll } from '../../../../utils/mcq-server';
import type { JudgeTest } from '../../../../utils/judge';

// Public: what the test page shows before someone joins — never the problems or the password.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')?.toLowerCase() ?? '';
  if (!/^[a-z0-9]{6,16}$/.test(code)) return NextResponse.json({ error: 'This test link is not valid.' }, { status: 404 });

  const admin = createAdminClient();
  const { data: test } = await admin.from('judge_tests').select('*').eq('code', code).maybeSingle<JudgeTest>();
  if (!test || test.status === 'draft') return NextResponse.json({ error: 'This test link is not valid, or the test has not been opened yet.' }, { status: 404 });

  // A signed-in student of the test's semester joins without the password, as themselves.
  const student = await signedInStudent(await createClient(), admin);
  let me = null;
  if (student) {
    const roll = studentRoll(student);
    const { data: p } = await admin.from('judge_participants').select('token, blocked').eq('test_id', test.id).eq('roll', roll).maybeSingle();
    me = { name: student.name, roll, ownSemester: test.semester !== null && test.semester === student.semester, token: p?.blocked ? null : p?.token ?? null, blocked: Boolean(p?.blocked) };
  }

  return NextResponse.json({
    title: test.title, kind: test.kind, semester: test.semester, status: test.status, strict: test.strict,
    duration: test.duration_minutes, endsAt: test.ends_at, languages: test.languages, count: test.problems.length,
    author: test.author_name, me,
  });
}
