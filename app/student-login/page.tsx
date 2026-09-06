'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';

export default function StudentLogin() {
  const router = useRouter();
  const [ruId, setRuId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('student_user')) router.replace('/student');
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { data: student, error: dbError } = await supabase
      .from('master_students')
      .select('id, name, ru_id, semester')
      .eq('ru_id', ruId)
      .eq('student_password', password)
      .single();

    if (dbError || !student) {
      setError('Invalid RU ID or Password.');
      setIsLoading(false);
      return;
    }

    localStorage.setItem('student_user', JSON.stringify(student));
    router.replace('/student');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg text-xl font-black">ICE</div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Student Portal</h2>
        <p className="mt-2 text-sm text-slate-600">Department of CSE</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-10 shadow-xl rounded-xl border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && <div className="bg-rose-50 text-rose-700 p-3 rounded-md text-sm font-bold">{error}</div>}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">RU ID</label>
              <input type="text" required value={ruId} onChange={(e) => setRuId(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 2538520145" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors shadow-md">
              {isLoading ? 'Authenticating...' : 'Access Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}