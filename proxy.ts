import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { FACULTY_ROLES, ROLE_HOME, TEACHER_PORTAL_ROLES, allowedRolesFor, roleFromMetadata } from './utils/auth';

// Runs before every page: refreshes the Supabase session cookie and keeps
// users out of areas their role doesn't cover. Data itself is guarded by RLS
// in the database and by role checks in each API route.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const role = roleFromMetadata(data?.claims?.app_metadata);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Carry over any refreshed session cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // Already signed in: skip the login screens.
  if ((pathname === '/login' || pathname === '/student-login') && role) {
    return redirectTo(ROLE_HOME[role]);
  }
  if (pathname === '/teacher-login' && role) {
    return redirectTo(TEACHER_PORTAL_ROLES.includes(role) ? '/teacher' : ROLE_HOME[role]);
  }

  if (pathname === '/teacher' || pathname.startsWith('/teacher/')) {
    if (!role || !TEACHER_PORTAL_ROLES.includes(role)) return redirectTo('/teacher-login');
  }

  if (pathname.startsWith('/dashboard')) {
    if (!role || !FACULTY_ROLES.includes(role)) return redirectTo('/login');
    // /dashboard itself is the HOD overview; everyone else goes to their own workspace.
    if (pathname === '/dashboard' && role !== 'hod') return redirectTo(ROLE_HOME[role]);
    const allowed = allowedRolesFor(pathname);
    if (allowed && !allowed.includes(role)) return redirectTo(ROLE_HOME[role]);
  }

  if (pathname.startsWith('/student') && pathname !== '/student-login') {
    if (role !== 'student') return redirectTo('/student-login');
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/student/:path*', '/teacher/:path*', '/login', '/student-login', '/teacher-login'],
};
