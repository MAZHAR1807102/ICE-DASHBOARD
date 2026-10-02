import { supabase } from './supabase';
import type { AppMetadata } from './auth';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: AppMetadata['role'];
  studentId?: string;
};

// For display only (names, greetings). Access control is enforced by the proxy,
// the API routes and RLS — never by what this returns.
export async function getSessionUser(): Promise<SessionUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const meta = session.user.app_metadata as AppMetadata;
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: meta.name ?? '',
    role: meta.role,
    studentId: meta.student_id,
  };
}

export async function signOut(redirectTo: string) {
  await supabase.auth.signOut();
  // Full reload so no cached data from the previous user survives.
  window.location.replace(redirectTo);
}

export async function changePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}
