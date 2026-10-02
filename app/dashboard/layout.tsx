'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenCheck, ClipboardCheck, LayoutDashboard, UsersRound, Wallet } from 'lucide-react';
import Brand from '../components/Brand';
import UserMenu from '../components/UserMenu';
import { useSessionUser } from '../../utils/useSessionUser';
import { DASHBOARD_ACCESS } from '../../utils/auth';

// Access to /dashboard/* is checked on the server in proxy.ts before this renders,
// and every query is filtered by the database's Row Level Security policies.

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/studAff', label: 'Finance', icon: Wallet },
  { href: '/dashboard/academic', label: 'Academic', icon: BookOpenCheck },
  { href: '/dashboard/exam', label: 'Exams', icon: ClipboardCheck },
  { href: '/dashboard/advisor', label: 'Advisory', icon: UsersRound },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useSessionUser();
  const role = user?.role;

  // The HOD sees every portal; everyone else sees only their own.
  const links = NAV.filter(({ href }) =>
    role === 'hod' || (href !== '/dashboard' && role !== undefined && (DASHBOARD_ACCESS[href] ?? []).includes(role)),
  );
  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));

  const nav = links.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive(href) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  ));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Brand subtitle="Department of CSE" href={links[0]?.href ?? '/dashboard'} />
          <nav className="hidden flex-1 items-center gap-1 lg:flex">{nav}</nav>
          <div className="ml-auto lg:ml-0">
            <UserMenu logoutTo="/login" showTeacherLink />
          </div>
        </div>
        {links.length > 1 && (
          <nav className="scroll-thin flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">{nav}</nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
