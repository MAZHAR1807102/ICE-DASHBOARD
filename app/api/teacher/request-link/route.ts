import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { ensureTeacherAccount, sendTeacherLink, teacherSignInUrl } from '../../../../utils/teacher-links';

// Public: a teacher asks for a fresh sign-in link. Only emails listed as a course teacher get one,
// and the response is the same either way so the form can't be used to discover addresses.
export async function POST(request: Request) {
  const generic = NextResponse.json({ message: 'If that email belongs to a course teacher, a sign-in link is on its way.' });
  try {
    const { email } = await request.json();
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!address.includes('@')) return generic;

    const admin = createAdminClient();
    const { data: courses } = await admin
      .from('courses')
      .select('course_code, course_name, semester, credit, teacher_name')
      .ilike('teacher_email', address);
    if (!courses || courses.length === 0) return generic;

    const name = courses[0].teacher_name ?? '';
    const origin = new URL(request.url).origin;
    await ensureTeacherAccount(admin, address, name);
    const signInUrl = await teacherSignInUrl(admin, address, origin);
    await sendTeacherLink({ to: address, name, courses, signInUrl, origin });
    return generic;
  } catch (error) {
    console.error('Teacher link request error:', error);
    return generic;
  }
}
