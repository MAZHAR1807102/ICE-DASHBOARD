import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { participantByToken, testView } from '../../../../utils/judge-server';

// GET ?token= — the test as this person sees it now (problems, their submissions, time, ranking).
export async function GET(request: Request) {
  const admin = createAdminClient();
  const p = await participantByToken(admin, new URL(request.url).searchParams.get('token'));
  if (!p) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(await testView(admin, p));
}
