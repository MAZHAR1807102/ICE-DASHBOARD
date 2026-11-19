import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { TEACHER_PORTAL_ROLES } from '../../../../utils/auth';
import { judgeConfigured, judgeReachable } from '../../../../utils/judge-server';

// Teachers: is the judge server connected and answering?
export async function GET() {
  const auth = await requireRole(TEACHER_PORTAL_ROLES);
  if ('error' in auth) return auth.error;
  return NextResponse.json({ configured: judgeConfigured(), reachable: await judgeReachable() });
}
