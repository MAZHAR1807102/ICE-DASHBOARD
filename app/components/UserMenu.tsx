'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ClipboardEdit, KeyRound, LogOut } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import { signOut } from '../../utils/session';
import { useSessionUser } from '../../utils/useSessionUser';

const ROLE_LABEL: Record<string, string> = {
  hod: 'Head of Department',
  finance: 'Finance & Student Affairs',
  academic: 'Academic Coordinator',
  exam: 'Exam Controller',
  advisor: 'Student Advisor',
  teacher: 'Course Teacher',
  student: 'Student',
};

export const initialsOf = (name?: string) =>
  (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Avatar button with a dropdown: who you are, change password, teacher portal, log out.
export default function UserMenu({ logoutTo, showTeacherLink = false }: { logoutTo: string; showTeacherLink?: boolean }) {
  const user = useSessionUser();
  const [open, setOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex size-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{initialsOf(user?.name)}</span>
        <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 md:block">{user?.name ?? '…'}</span>
        <ChevronDown className="size-4 text-slate-400" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 animate-pop-in rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200" role="menu">
          <div className="border-b border-slate-100 px-3 pb-2.5 pt-2">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{ROLE_LABEL[user?.role ?? ''] ?? ''}</p>
          </div>
          <div className="pt-1.5">
            {showTeacherLink && (
              <Link href="/teacher" className={item} role="menuitem" onClick={() => setOpen(false)}>
                <ClipboardEdit className="size-4 text-slate-400" aria-hidden /> Teacher portal (CT marks)
              </Link>
            )}
            <button className={item} role="menuitem" onClick={() => { setOpen(false); setIsPasswordOpen(true); }}>
              <KeyRound className="size-4 text-slate-400" aria-hidden /> Change password
            </button>
            <button className={`${item} text-rose-600 hover:bg-rose-50`} role="menuitem" onClick={() => signOut(logoutTo)}>
              <LogOut className="size-4" aria-hidden /> Log out
            </button>
          </div>
        </div>
      )}

      {isPasswordOpen && <ChangePasswordModal onClose={() => setIsPasswordOpen(false)} />}
    </div>
  );
}
