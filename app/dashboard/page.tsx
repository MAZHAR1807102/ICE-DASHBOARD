'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';

type UserSession = { name: string, role: string, email: string };

export default function DepartmentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [stats, setStats] = useState({ totalStudents: 0, activeCourses: 0, pendingClearances: 0 });

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' });
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem('faculty_user');
    if (!session) {
      router.push('/login');
      return;
    }
    
    setUser(JSON.parse(session));

    async function fetchStats() {
      const { count: studentCount } = await supabase.from('master_students').select('*', { count: 'exact', head: true });
      const { count: courseCount } = await supabase.from('courses').select('*', { count: 'exact', head: true });
      setStats({
        totalStudents: studentCount || 0,
        activeCourses: courseCount || 0,
        pendingClearances: 0 // You can calculate this dynamically if needed
      });
    }
    fetchStats();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('faculty_user');
    router.push('/login');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsUpdatingPwd(true);
    setPwdMessage({ type: '', text: '' });

    // 1. Verify the old password first
    const { data: userData, error: verifyError } = await supabase
      .from('faculty_users')
      .select('password')
      .eq('email', user.email)
      .single();

    if (verifyError || userData?.password !== oldPassword) {
      setPwdMessage({ type: 'error', text: 'Current password is incorrect.' });
      setIsUpdatingPwd(false);
      return;
    }

    // 2. Update to the new password
    const { error: updateError } = await supabase
      .from('faculty_users')
      .update({ password: newPassword })
      .eq('email', user.email);

    if (updateError) {
      setPwdMessage({ type: 'error', text: 'Failed to update password. Try again.' });
    } else {
      setPwdMessage({ type: 'success', text: 'Password successfully updated!' });
      setOldPassword('');
      setNewPassword('');
      // Auto-close modal after success
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwdMessage({ type: '', text: '' });
      }, 2000);
    }
    setIsUpdatingPwd(false);
  };

  if (!user) return <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center text-gray-500">Loading secure portal...</div>;

  // Enforce rigid access control
  const isHOD = user.role === 'hod';
  const canSeeAcademic = isHOD || user.role === 'academic';
  const canSeeExam = isHOD || user.role === 'exam';
  const canSeeFinance = isHOD || user.role === 'finance';

  return (
    <div className="min-h-screen bg-[#f8fafc] p-8 relative">
      <header className="mb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">Department of CSE</h1>
            <p className="text-lg text-gray-600 font-medium">Imperial College of Engineering • Faculty Portal</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-4">
            <div className="text-right mr-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{user.role} Privilege</span>
              <p className="text-indigo-700 font-bold text-lg">{user.name}</p>
            </div>
            
            {/* Account Controls */}
            <div className="flex flex-col space-y-2">
              <button 
                onClick={() => setShowPasswordModal(true)} 
                className="px-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors shadow-sm"
              >
                Change Password
              </button>
              <button 
                onClick={handleLogout} 
                className="px-4 py-1.5 border border-red-200 bg-red-50 rounded-lg text-xs font-bold text-red-600 hover:bg-red-100 transition-colors shadow-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* High-Level Stats (Only HOD sees full metrics) */}
      {isHOD && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase">Enrolled Students</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-1">{stats.totalStudents}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl text-blue-600 text-3xl">🎓</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase">Active Courses</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-1">{stats.activeCourses}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl text-purple-600 text-3xl">📚</div>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Your Authorized Workspaces</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {canSeeAcademic && (
          <Link href="/dashboard/academic" className="group block h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full transition-all hover:shadow-md hover:border-indigo-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
              <div className="flex items-center space-x-3 mb-4"><span className="text-3xl">📋</span><h3 className="text-lg font-bold text-gray-900">Academic Coordination</h3></div>
              <p className="text-sm text-gray-600">Manage class attendance, update CT marks, and assign faculty.</p>
            </div>
          </Link>
        )}

        {canSeeExam && (
          <Link href="/dashboard/exam" className="group block h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full transition-all hover:shadow-md hover:border-blue-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
              <div className="flex items-center space-x-3 mb-4"><span className="text-3xl">📝</span><h3 className="text-lg font-bold text-gray-900">Examination Center</h3></div>
              <p className="text-sm text-gray-600">Process exam clearances, check eligibility, and generate admit cards.</p>
            </div>
          </Link>
        )}

        {canSeeFinance && (
          <Link href="/dashboard/studAff" className="group block h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full transition-all hover:shadow-md hover:border-emerald-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
              <div className="flex items-center space-x-3 mb-4"><span className="text-3xl">💵</span><h3 className="text-lg font-bold text-gray-900">Student Affairs (Finance)</h3></div>
              <p className="text-sm text-gray-600">Update financial dues, log payments, and manage fee clearings.</p>
            </div>
          </Link>
        )}

        {isHOD && (
          <Link href="/dashboard/hod" className="group block h-full">
            <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 h-full transition-all hover:shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
              <div className="flex items-center space-x-3 mb-4"><span className="text-3xl">👑</span><h3 className="text-lg font-bold text-white">HOD Command Center</h3></div>
              <p className="text-sm text-gray-400">Executive dashboard. Monitor level-3 escalations and department bottlenecks.</p>
            </div>
          </Link>
        )}
      </div>

      {/* Change Password Modal Overlay */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full relative">
            <button 
              onClick={() => { setShowPasswordModal(false); setPwdMessage({ type: '', text: '' }); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Change Password</h3>
            <p className="text-sm text-gray-500 mb-6">Update credentials for {user.email}</p>

            {pwdMessage.text && (
              <div className={`mb-4 p-3 rounded text-sm font-medium ${pwdMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {pwdMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  minLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={isUpdatingPwd}
                className="w-full bg-indigo-600 text-white rounded p-2 text-sm font-bold hover:bg-indigo-700 transition-colors mt-2 disabled:bg-indigo-400"
              >
                {isUpdatingPwd ? 'Updating...' : 'Save New Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}