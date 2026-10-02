import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { roleFromMetadata, type Role } from './auth';

// Server client bound to the caller's session cookie: queries run as that user, under RLS.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a context that can't set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Verifies the caller's session and role for an API route.
 * Returns either { supabase, userId, role } or { error } — a ready-made 401/403 response.
 */
export async function requireRole(allowed: Role[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  }

  const role = roleFromMetadata(user.app_metadata);
  if (!role || !allowed.includes(role)) {
    return { error: NextResponse.json({ error: 'You do not have permission for this action.' }, { status: 403 }) };
  }

  return { supabase, userId: user.id, role };
}
