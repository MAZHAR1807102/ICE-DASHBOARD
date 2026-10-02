'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function TeacherLoginForm() {
  const expired = useSearchParams().get('expired') === '1';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    await fetch('/api/teacher/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setStatus('sent');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 font-sans">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-black shadow-lg mb-4">ICE</div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Teacher Portal</h1>
        <p className="mt-2 text-sm text-slate-600">Enter CT marks for the courses you teach.</p>
      </div>

      <div className="mt-8 mx-auto w-full max-w-md bg-white py-8 px-6 sm:px-10 shadow-xl rounded-xl border border-slate-100">
        {expired && status === 'idle' && (
          <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium rounded-lg p-3">
            That sign-in link has expired or was already used. Request a new one below.
          </div>
        )}

        {status === 'sent' ? (
          <div className="text-center space-y-2">
            <div className="text-4xl" aria-hidden>📬</div>
            <p className="font-bold text-slate-900">Check your inbox</p>
            <p className="text-sm text-slate-600">
              If <b>{email}</b> is listed as a course teacher, a sign-in link is on its way. It may take a minute — check spam too.
            </p>
            <button onClick={() => setStatus('idle')} className="mt-3 text-sm font-bold text-indigo-600 hover:underline">Use a different email</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Your email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="the email the academic office has on file"
              />
            </div>
            <button type="submit" disabled={status === 'sending'} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            <p className="text-xs text-slate-500 text-center">No password needed — we email you a one-time link.</p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function TeacherLoginPage() {
  return (
    <Suspense>
      <TeacherLoginForm />
    </Suspense>
  );
}
