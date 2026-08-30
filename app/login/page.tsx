'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. Log to console so we know the button click worked
      console.log("Attempting to log in with:", email);

      const { data, error: dbError } = await supabase
        .from('faculty_users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      // 2. Catch Supabase-specific database errors
      if (dbError) {
        console.error("Supabase Error:", dbError);
        setError(`Login failed: ${dbError.message}`);
        setIsLoading(false);
        return;
      }

      if (!data) {
        setError('Invalid email or password.');
        setIsLoading(false);
        return;
      }

      // 3. Success! Save and redirect
      localStorage.setItem('faculty_user', JSON.stringify({
        name: data.name,
        role: data.role,
        email: data.email
      }));
      
      console.log("Login successful, redirecting...");
      router.push('/dashboard');

    } catch (err: any) {
      // 4. Catch critical network or code crashes
      console.error("Critical Crash:", err);
      setError(`System Error: ${err.message || "Check the developer console"}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-lg mx-auto flex items-center justify-center mb-4 shadow-sm">
            <span className="text-white text-xl font-bold">ICE</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Faculty Portal Sign In</h2>
          <p className="text-sm text-gray-500 mt-2">Department of Computer Science & Engineering</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-medium mb-6 text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              placeholder="faculty@imperial.edu"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 text-white rounded-lg p-3 text-sm font-bold hover:bg-indigo-700 transition-colors disabled:bg-indigo-400"
          >
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}