import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { participantByToken, processSubmission, shownSubmission } from '../../../../utils/judge-server';
import type { JudgeSubmission } from '../../../../utils/judge';

// GET ?token=&id= — one of this person's submissions, moved along by the judge if it is waiting.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const admin = createAdminClient();
  const p = await participantByToken(admin, params.get('token'));
  if (!p) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data: sub } = await admin.from('judge_submissions').select('*').eq('id', params.get('id') ?? '').eq('participant_id', p.id).maybeSingle();
  if (!sub) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(shownSubmission(await processSubmission(admin, sub as JudgeSubmission & { judge_tokens: string[] | null })));
}
