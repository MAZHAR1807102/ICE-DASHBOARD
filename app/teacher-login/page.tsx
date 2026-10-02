'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock, MailCheck, Send } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { Button, Field, inputClass } from '../components/ui';

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

  if (status === 'sent') {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><MailCheck className="size-7" aria-hidden /></span>
        <p className="text-lg font-semibold text-slate-900">Check your inbox</p>
        <p className="mt-2 text-sm text-slate-600">If <b>{email}</b> is listed as a course teacher, a sign-in link is on its way. It can take a minute — check spam too.</p>
        <Button variant="ghost" className="mt-4" onClick={() => setStatus('idle')}>Use a different email</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {expired && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> That sign-in link has expired or was already used. Request a new one below.
        </div>
      )}
      <Field label="Your email" hint="The address the academic office has on file for your course.">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} h-11`} placeholder="you@example.com" />
      </Field>
      <Button type="submit" size="lg" icon={Send} loading={status === 'sending'} className="w-full">Email me a sign-in link</Button>
    </form>
  );
}

export default function TeacherLoginPage() {
  return (
    <AuthLayout
      title="Enter CT marks in minutes."
      subtitle="Teacher sign in"
      accent="from-indigo-700 via-violet-700 to-purple-700"
      highlights={['Only your own courses and students', 'Type marks or upload a spreadsheet', 'No password — we email you a one-time link']}
      footer="Office staff sign in from the faculty page."
    >
      <Suspense>
        <TeacherLoginForm />
      </Suspense>
    </AuthLayout>
  );
}
