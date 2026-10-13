'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser } from '../../utils/session';
import Brand from '../components/Brand';
import UserMenu from '../components/UserMenu';
import { loadProfile, type Profile } from './_components/data';
import ProfileView from './_components/ProfileView';

export default function StudentPortal() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getSessionUser().then((user) => {
      if (!user?.studentId) {
        router.replace('/student-login');
        return;
      }
      loadProfile(user.studentId).then(setProfile);
    });
  }, [router]);

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* TOP BAR */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Brand subtitle="Student portal" href="/student" />
          <UserMenu logoutTo="/student-login" />
        </div>
      </header>

      <ProfileView profile={profile} />

    </div>
  );
}
