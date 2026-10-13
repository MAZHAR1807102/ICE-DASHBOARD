'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';
import Brand from '../../components/Brand';
import UserMenu from '../../components/UserMenu';
import ProfileView from '../../student/_components/ProfileView';
import type { Profile } from '../../../utils/profile';

// "View as student": the student portal exactly as this student sees it, opened from Academic.
// Read-only; access is limited to the academic office and the HOD (proxy.ts and the API route).
export default function ViewAsStudent() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/students/profile?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.ok) setProfile(body as Profile);
        else setError(body.error ?? 'Could not load this student.');
      })
      .catch(() => setError('Could not load this student.'));
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-amber-400 text-amber-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Eye className="size-4" aria-hidden />
            {profile ? `Viewing as ${profile.student.name} — exactly what they see. Read-only.` : 'Student view — read-only'}
          </p>
          <Link href="/dashboard/academic" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Back to Academic
          </Link>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Brand subtitle="Student portal" href="/dashboard/academic" />
          <UserMenu logoutTo="/login" />
        </div>
      </header>

      {profile ? (
        <ProfileView profile={profile} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-32">
          {error ? (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>
          ) : (
            <>
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
              <p className="text-sm font-semibold text-slate-500">Loading the student&apos;s profile…</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
