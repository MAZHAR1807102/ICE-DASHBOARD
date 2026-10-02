// Shared auth vocabulary used by the proxy, API routes, login pages and dashboards.

export type Role = 'hod' | 'finance' | 'academic' | 'exam' | 'advisor' | 'teacher' | 'student';

export const FACULTY_ROLES: Role[] = ['hod', 'finance', 'academic', 'exam', 'advisor'];

// Course teachers sign in by emailed link; office staff who also teach can use the portal too.
export const TEACHER_PORTAL_ROLES: Role[] = ['teacher', ...FACULTY_ROLES];

// Students log in with their RU ID; Supabase Auth needs an email, so we map it to an internal one.
export const STUDENT_EMAIL_DOMAIN = 'students.ice-portal.local';
export const studentEmail = (ruId: string) => `${ruId.trim()}@${STUDENT_EMAIL_DOMAIN}`;

// Which roles may open each dashboard section. Anything not listed is open to all faculty.
export const DASHBOARD_ACCESS: Record<string, Role[]> = {
  '/dashboard/studAff': ['finance', 'hod'],
  '/dashboard/academic': ['academic', 'hod'],
  '/dashboard/exam': ['exam', 'hod'],
  '/dashboard/advisor': ['advisor', 'hod'],
};

export const ROLE_HOME: Record<Role, string> = {
  hod: '/dashboard',
  finance: '/dashboard/studAff',
  academic: '/dashboard/academic',
  exam: '/dashboard/exam',
  advisor: '/dashboard/advisor',
  teacher: '/teacher',
  student: '/student',
};

export type AppMetadata = {
  role?: Role;
  name?: string;
  student_id?: string;
};

export function roleFromMetadata(meta: unknown): Role | null {
  const role = (meta as AppMetadata | undefined)?.role;
  return role && role in ROLE_HOME ? role : null;
}

export function allowedRolesFor(pathname: string): Role[] | null {
  const match = Object.keys(DASHBOARD_ACCESS).find(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
  return match ? DASHBOARD_ACCESS[match] : null;
}
