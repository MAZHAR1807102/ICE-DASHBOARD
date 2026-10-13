import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { fetchProfile } from '../../../../utils/profile';

// "View as student": the academic office and the HOD see a student's portal exactly as the student
// does. Read-only — the same queries the portal runs, read server-side because staff can't read
// every one of those tables directly (e.g. the finance ledger).
export async function GET(request: Request) {
  const auth = await requireRole(['academic', 'hod']);
  if ('error' in auth) return auth.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'A student id is required.' }, { status: 400 });
  }

  try {
    const profile = await fetchProfile(createAdminClient(), id);
    if (!profile) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Student profile error:', error);
    return NextResponse.json({ error: 'Could not load this student.' }, { status: 500 });
  }
}
