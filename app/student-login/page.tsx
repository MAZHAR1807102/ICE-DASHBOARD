'use client';

import React, { useState } from 'react';
import { AlertCircle, LogIn } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { roleFromMetadata, studentEmail } from '../../utils/auth';
import AuthLayout from '../components/AuthLayout';
import { Button, Field, inputClass } from '../components/ui';

export default function StudentLogin() {
  const [ruId, setRuId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Already-signed-in visitors are redirected away from this page by proxy.ts.

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: studentEmail(ruId),
      password,
    });

    if (authError || roleFromMetadata(data.user?.app_metadata) !== 'student') {
      if (data.session) await supabase.auth.signOut();
      setError('Invalid RU ID or password.');
      setIsLoading(false);
      return;
    }

    // Full navigation so the proxy sees the new session cookie.
    window.location.replace('/student');
  };

  return (
    <AuthLayout
      title="Everything about your studies, in one place."
      subtitle="Student sign in"
      accent="from-violet-600 via-indigo-600 to-indigo-700"
      highlights={['Results history and CGPA', 'CT marks and attendance for every course', 'Fees, payments and receipts']}
      footer="Forgot your password? Ask the academic office to reset it."
    >
      <form className="space-y-5" onSubmit={handleLogin}>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </div>
        )}
        <Field label="RU ID">
          <input type="text" inputMode="numeric" required value={ruId} onChange={(e) => setRuId(e.target.value)} className={`${inputClass} h-11 tracking-wide`} placeholder="e.g. 2538520145" />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} h-11`} />
        </Field>
        <Button type="submit" size="lg" icon={LogIn} loading={isLoading} className="w-full">Open my profile</Button>
      </form>
    </AuthLayout>
  );
}
