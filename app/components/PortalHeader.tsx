'use client';

import { useState } from 'react';
import ChangePasswordModal from './ChangePasswordModal';
import { signOut } from '../../utils/session';
import { useSessionUser } from '../../utils/useSessionUser';

const ACCENTS = {
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-500',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-500',
  purple: 'bg-purple-50 border-purple-200 text-purple-500',
  blue: 'bg-blue-50 border-blue-200 text-blue-500',
  slate: 'bg-slate-50 border-slate-200 text-slate-500',
};

// Shared header for the faculty dashboards: title, signed-in name, password change and logout.
export default function PortalHeader({
  title,
  subtitle,
  accent = 'slate',
}: {
  title: string;
  subtitle?: string;
  accent?: keyof typeof ACCENTS;
}) {
  const user = useSessionUser();
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);

  return (
    <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center space-x-5">
        <div className="flex -space-x-3">
          <div className="w-14 h-14 rounded-full bg-white shadow-sm border-2 border-slate-200 flex items-center justify-center z-10">
            <span className="text-xs font-black text-slate-400">ICE</span>
          </div>
          <div className={`w-14 h-14 rounded-full shadow-sm border-2 flex items-center justify-center ${ACCENTS[accent]}`}>
            <span className="text-[10px] font-bold">CSE</span>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {user?.name || 'Loading...'} | {subtitle ?? 'Department of CSE'}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={() => setIsPasswordOpen(true)}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-bold shadow-sm transition-colors"
        >
          Change Password
        </button>
        <button
          onClick={() => signOut('/login')}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
        >
          Logout
        </button>
      </div>

      {isPasswordOpen && <ChangePasswordModal onClose={() => setIsPasswordOpen(false)} />}
    </header>
  );
}
