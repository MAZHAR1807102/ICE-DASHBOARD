'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auto-skip if the device already remembers an active session
  useEffect(() => {
    const session = localStorage.getItem('faculty_user');
    if (session) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Fetch the user from your dynamic faculty_users table
      const { data: user, error: dbError } = await supabase
        .from('faculty_users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (dbError || !user) {
        setError('Invalid credentials. Please verify your email and password.');
        setIsLoading(false);
        return;
      }

      // Save the verified database session to device memory
      const userSession = { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name 
      };
      localStorage.setItem('faculty_user', JSON.stringify(userSession));
      
      // Redirect to the traffic director
      router.replace('/dashboard');

    } catch (err) {
      setError('A connection error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center -space-x-2 mb-6">
          <div className="w-16 h-16 rounded-full bg-white shadow-md border-2 border-slate-200 flex items-center justify-center z-10">
            <span className="text-sm font-black text-slate-400">ICE</span>
          </div>
          <div className="w-16 h-16 rounded-full bg-indigo-50 shadow-md border-2 border-indigo-200 flex items-center justify-center z-0">
            <span className="text-xs font-bold text-indigo-500">CSE</span>
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          Faculty Portal Access
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to manage departmental operations
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-md animate-in fade-in slide-in-from-top-2">
                <p className="text-sm text-rose-700 font-bold">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Institutional Email</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none block w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                placeholder="faculty@imperial.edu"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : 'Secure Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}