import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { studentEmail } from '../../../../utils/auth';

// Creates a student's portal login, or resets the password if one already exists.
export async function POST(request: Request) {
  const auth = await requireRole(['academic', 'hod']);
  if ('error' in auth) return auth.error;

  try {
    const { studentId, password } = await request.json();

    if (!studentId || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'A student and a password of at least 6 characters are required.' }, { status: 400 });
    }

    const { data: student, error: studentError } = await auth.supabase
      .from('master_students')
      .select('id, ru_id, name')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }
    if (!student.ru_id) {
      return NextResponse.json({ error: 'This student has no RU ID yet. Add it first — students log in with it.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const email = studentEmail(String(student.ru_id));
    const appMetadata = { role: 'student', name: student.name ?? '', student_id: student.id };

    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
    });

    if (!createError) {
      return NextResponse.json({ success: true, message: `Login created for ${student.name} (RU ID ${student.ru_id}).` });
    }

    // Account already exists: find it and reset the password instead.
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;

      const existing = data.users.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
          password,
          app_metadata: appMetadata,
        });
        if (updateError) throw updateError;
        return NextResponse.json({ success: true, message: `Password reset for ${student.name} (RU ID ${student.ru_id}).` });
      }
      if (data.users.length < 1000) break;
    }

    throw createError;
  } catch (error) {
    console.error('Set student login error:', error);
    return NextResponse.json({ error: 'Failed to set the student login.' }, { status: 500 });
  }
}
