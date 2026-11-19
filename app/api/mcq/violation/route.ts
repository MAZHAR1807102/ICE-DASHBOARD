import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { attemptByToken, isOverdue } from '../../../../utils/mcq-server';

// Strict mode: the exam page reports that the person left it (another tab/app/window, minimised,
// closed). 1st time → warning, 2nd → blocked (mcq_violation does it atomically; one leave counts once).
export async function POST(request: Request) {
  const body = await request.text().then((t) => { try { return JSON.parse(t); } catch { return {}; } });
  const admin = createAdminClient();
  const attempt = await attemptByToken(admin, body.token);
  if (!attempt) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!attempt.mcq_exams.strict || attempt.submitted_at || attempt.blocked || isOverdue(attempt)) {
    return NextResponse.json({ warnings: attempt.warnings, blocked: attempt.blocked });
  }
  const kind = typeof body.kind === 'string' ? body.kind.slice(0, 40) : 'left the page';
  const { data, error } = await admin.rpc('mcq_violation', { p_attempt: attempt.id, p_kind: kind });
  if (error) {
    console.error('mcq violation', error);
    return NextResponse.json({ error: 'Could not record.' }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as { warnings: number; blocked: boolean } | undefined;
  return NextResponse.json({ warnings: row?.warnings ?? attempt.warnings, blocked: row?.blocked ?? attempt.blocked });
}
