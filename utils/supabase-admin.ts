import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS and can manage Auth users.
// Server-only — import it from API routes, never from a 'use client' file.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
