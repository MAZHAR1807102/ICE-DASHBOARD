import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { participantByToken, participantState, testView } from '../../../../utils/judge-server';

// POST { token } — "Finish test": no more submissions; the page shows the result.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const p = await participantByToken(admin, body.token);
  if (!p) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (participantState(p) === 'running') {
    await admin.from('judge_participants').update({ finished_at: new Date().toISOString() }).eq('id', p.id).is('finished_at', null);
  }
  return NextResponse.json(await testView(admin, (await participantByToken(admin, body.token))!));
}
