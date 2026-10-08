import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { studentEmail } from '../../../../utils/auth';

// Creates a student's portal login, resets its password, or (no password given) moves it to the
// student's current RU ID after the RU ID was edited.
export async function POST(request: Request) {
  const auth = await requireRole(['academic', 'hod']);
  if ('error' in auth) return auth.error;

  try {
    const { studentId, password } = await request.json();

    // Without a password this only moves an existing login to the student's current RU ID.
    if (!studentId || (password !== undefined && (typeof password !== 'string' || password.length < 6))) {
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
    const email = studentEmail(String(student.ru_id).trim());
    const appMetadata = { role: 'student', name: student.name ?? '', student_id: student.id };

    // An existing login belongs to this student, or carries their RU ID.
    let existing: { id: string; email?: string } | undefined;
    for (let page = 1; !existing; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      existing = data.users.find((u) => u.app_metadata?.student_id === student.id) ?? data.users.find((u) => u.email?.toLowerCase() === email);
      if (data.users.length < 1000) break;
    }

    if (existing) {
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        email,
        email_confirm: true,
        app_metadata: appMetadata,
        ...(password ? { password } : {}),
      });
      if (updateError) throw updateError;
      return NextResponse.json({
        success: true,
        message: password ? `Password reset for ${student.name} (RU ID ${student.ru_id}).` : `${student.name} now signs in with RU ID ${student.ru_id}.`,
      });
    }

    if (!password) {
      return NextResponse.json({ error: 'This student has no login yet. Use “Set Login” to give them a password.' }, { status: 400 });
    }
    const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: appMetadata });
    if (createError) throw createError;
    return NextResponse.json({ success: true, message: `Login created for ${student.name} (RU ID ${student.ru_id}).` });
  } catch (error) {
    console.error('Set student login error:', error);
    return NextResponse.json({ error: 'Failed to set the student login.' }, { status: 500 });
  }
}
