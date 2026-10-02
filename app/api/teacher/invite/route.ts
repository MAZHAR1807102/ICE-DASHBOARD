import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { ensureTeacherAccount, sendTeacherLink, teacherSignInUrl } from '../../../../utils/teacher-links';

// Academic office: email each teacher of the chosen courses a sign-in link (one email per teacher).
export async function POST(request: Request) {
  const auth = await requireRole(['academic', 'hod']);
  if ('error' in auth) return auth.error;

  try {
    const { courseIds } = await request.json();
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one course.' }, { status: 400 });
    }

    const { data: courses, error } = await auth.supabase
      .from('courses')
      .select('course_code, course_name, semester, credit, teacher_name, teacher_email')
      .in('id', courseIds);
    if (error) throw error;

    type CourseRow = NonNullable<typeof courses>[number];
    const byTeacher = new Map<string, { name: string; courses: CourseRow[] }>();
    const missingEmail: string[] = [];
    for (const c of courses ?? []) {
      const email = c.teacher_email?.trim().toLowerCase();
      if (!email) { missingEmail.push(c.course_code); continue; }
      const entry: { name: string; courses: CourseRow[] } = byTeacher.get(email) ?? { name: c.teacher_name ?? '', courses: [] };
      entry.courses.push(c);
      byTeacher.set(email, entry);
    }

    const admin = createAdminClient();
    const origin = new URL(request.url).origin;
    const sent: string[] = [];
    const failed: string[] = [];
    for (const [email, { name, courses: theirs }] of byTeacher) {
      try {
        await ensureTeacherAccount(admin, email, name);
        const signInUrl = await teacherSignInUrl(admin, email, origin);
        await sendTeacherLink({ to: email, name, courses: theirs, signInUrl, origin });
        sent.push(email);
      } catch (e) {
        console.error('Teacher invite failed for', email, e);
        failed.push(email);
      }
    }

    return NextResponse.json({ sent, failed, missingEmail });
  } catch (error) {
    console.error('Teacher invite error:', error);
    return NextResponse.json({ error: 'Failed to send teacher links.' }, { status: 500 });
  }
}
