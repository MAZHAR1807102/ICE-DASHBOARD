import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { participantByToken, participantState } from '../../../../utils/judge-server';

// Strict mode: the test page reports that the person left it (switched tab/app, minimised, closed).
// Sent with navigator.sendBeacon, so it arrives even when the page is closing (text/plain JSON).
// 1st time → warning, 2nd → blocked (judge_violation does it atomically; one leave counts once).
export async function POST(request: Request) {
  const body = await request.text().then((t) => { try { return JSON.parse(t); } catch { return {}; } });
  const admin = createAdminClient();
  const p = await participantByToken(admin, body.token);
  if (!p) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!p.judge_tests.strict || participantState(p) !== 'running') return NextResponse.json({ warnings: p.warnings, blocked: p.blocked });
  const kind = typeof body.kind === 'string' ? body.kind.slice(0, 40) : 'left the page';
  const { data, error } = await admin.rpc('judge_violation', { p_participant: p.id, p_kind: kind });
  if (error) {
    console.error('judge violation', error);
    return NextResponse.json({ error: 'Could not record.' }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as { warnings: number; blocked: boolean } | undefined;
  return NextResponse.json({ warnings: row?.warnings ?? p.warnings, blocked: row?.blocked ?? p.blocked });
}
