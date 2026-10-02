'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, LogIn } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { FACULTY_ROLES, ROLE_HOME, roleFromMetadata } from '../../utils/auth';
import AuthLayout from '../components/AuthLayout';
import { Button, Field, inputClass } from '../components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Already-signed-in visitors are redirected away from this page by proxy.ts.

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      const role = roleFromMetadata(data.user?.app_metadata);
      if (authError || !role || !FACULTY_ROLES.includes(role)) {
        if (data.session) await supabase.auth.signOut();
        setError('Invalid credentials. Please verify your email and password.');
        setIsLoading(false);
        return;
      }

      // Full navigation so the proxy sees the new session cookie.
      window.location.replace(ROLE_HOME[role]);
    } catch {
      setError('A connection error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Run the department from one place."
      subtitle="Faculty sign in"
      highlights={['Billing, payments and receipts', 'Courses, attendance and CT marks', 'Eligibility checks and results']}
      footer={<>Course teacher entering CT marks? <Link href="/teacher-login" className="font-semibold text-indigo-600 hover:underline">Sign in here</Link></>}
    >
      <form className="space-y-5" onSubmit={handleLogin}>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </div>
        )}
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} h-11`} placeholder="you@imperial.edu" />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} h-11`} />
        </Field>
        <Button type="submit" size="lg" icon={LogIn} loading={isLoading} className="w-full">Sign in</Button>
      </form>
    </AuthLayout>
  );
}
