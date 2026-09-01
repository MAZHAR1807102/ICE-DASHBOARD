'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../utils/supabase';

export default function DashboardRoot() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // HOD Aggregated Metrics
  const [metrics, setMetrics] = useState({
    totalStudents: 0,
    totalRevenuePending: 0,
    avgAttendance: 0,
    studentsAtRisk: 0,
    activeCourses: 0,
  });

  useEffect(() => {
    const session = localStorage.getItem('faculty_user');
    if (!session) {
      router.replace('/login');
      return;
    }

    const user = JSON.parse(session);
    setUserRole(user.role);
    setUserName(user.name);

    // Auto-Redirect Faculty to their specific workspaces
    if (user.role === 'finance') {
      router.replace('/dashboard/studAff');
    } else if (user.role === 'academic') {
      router.replace('/dashboard/academic');
    } else if (user.role === 'exam') {
      router.replace('/dashboard/exam');
    } else if (user.role === 'advisor') {
      router.replace('/dashboard/advisor');
    } else if (user.role === 'hod') {
      fetchHODMetrics();
    }
  }, [router]);

  const fetchHODMetrics = async () => {
    setIsLoading(true);
    
    // Fetch system-wide data for the HOD overview
    const { data: students } = await supabase.from('master_students').select('*');
    const { data: courses } = await supabase.from('courses').select('id');

    if (students) {
      let pendingRevenue = 0;
      let totalAtt = 0;
      let atRisk = 0;

      students.forEach(s => {
        pendingRevenue += (s.agreed_monthly_fee || 0) + (s.agreed_semester_fee || 0) + (s.agreed_ru_exam_fee || 0);
        totalAtt += (s.attendance_percentage || 0);
        if ((s.attendance_percentage || 0) < 60) atRisk++;
      });

      setMetrics({
        totalStudents: students.length,
        totalRevenuePending: pendingRevenue,
        avgAttendance: students.length > 0 ? Math.round(totalAtt / students.length) : 0,
        studentsAtRisk: atRisk,
        activeCourses: courses ? courses.length : 0
      });
    }
    
    setIsLoading(false);
  };

  // Prevent UI flash while routing standard faculty members
  if (isLoading || userRole === 'finance' || userRole === 'academic' || userRole === 'exam' || userRole === 'advisor') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Initializing Environment</p>
      </div>
    );
  }

  // --- HOD COMMAND CENTER UI ---
  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10 font-sans text-slate-800">
      
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Department Overview</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1 uppercase tracking-wider">
            {userName} | Head of Department
          </p>
        </div>
        
        <button 
          onClick={() => {
            localStorage.removeItem('faculty_user');
            router.push('/login');
          }}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
        >
          End Session
        </button>
      </header>

      {/* --- EXECUTIVE SUMMARY METRICS --- */}
      <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Executive Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Total Enrollment</p>
          <p className="text-3xl font-black text-slate-900">{metrics.totalStudents}</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Total Outstanding Dues</p>
          <p className="text-3xl font-black text-rose-600">৳{metrics.totalRevenuePending.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Average Attendance</p>
          <p className="text-3xl font-black text-slate-900">{metrics.avgAttendance}%</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-white to-rose-50">
          <p className="text-xs font-bold text-rose-600 uppercase mb-1">Students At Risk (&lt;60%)</p>
          <p className="text-3xl font-black text-rose-700">{metrics.studentsAtRisk}</p>
        </div>
      </div>

      {/* --- SYSTEM MODULES --- */}
      <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Department Portals</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* FINANCE PORTAL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-emerald-50/30">
            <h3 className="text-lg font-black text-slate-900">Finance & Student Affairs</h3>
            <p className="text-sm text-slate-500 font-medium mt-1">Managed by Teacher 1</p>
          </div>
          <div className="p-6 flex-grow flex flex-col justify-between">
            <ul className="space-y-3 text-sm font-medium text-slate-600 mb-6">
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span> Fee Structure Configuration</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span> Batch-wide Mass Billing</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span> Individual Payment Receipts</li>
            </ul>
            <Link href="/dashboard/studAff" className="block w-full text-center py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors">
              Access Finance Portal
            </Link>
          </div>
        </div>

        {/* ACADEMIC PORTAL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-indigo-50/30">
            <h3 className="text-lg font-black text-slate-900">Academic Coordination</h3>
            <p className="text-sm text-slate-500 font-medium mt-1">Managed by Teacher 3</p>
          </div>
          <div className="p-6 flex-grow flex flex-col justify-between">
            <ul className="space-y-3 text-sm font-medium text-slate-600 mb-6">
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2"></span> Curriculum Catalog ({metrics.activeCourses} Active)</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2"></span> Bulk Attendance Processing</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2"></span> CT Mark Automations</li>
            </ul>
            <Link href="/dashboard/academic" className="block w-full text-center py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors">
              Access Academic Portal
            </Link>
          </div>
        </div>

        {/* EXAM CONTROL PORTAL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-purple-50/30">
            <h3 className="text-lg font-black text-slate-900">Exam Control & Results</h3>
            <p className="text-sm text-slate-500 font-medium mt-1">Managed by Teacher 2</p>
          </div>
          <div className="p-6 flex-grow flex flex-col justify-between">
            <ul className="space-y-3 text-sm font-medium text-slate-600 mb-6">
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2"></span> Tabulate Final Grades</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2"></span> Form Fill-up Management</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2"></span> Generate Admit Cards & Transcripts</li>
            </ul>
            <Link href="/dashboard/exam" className="block w-full text-center py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors">
              Access Exam Portal
            </Link>
          </div>
        </div>

        {/* ADVISORS PORTAL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-blue-50/30">
            <h3 className="text-lg font-black text-slate-900">Student Advisory</h3>
            <p className="text-sm text-slate-500 font-medium mt-1">Managed by Batch Advisors</p>
          </div>
          <div className="p-6 flex-grow flex flex-col justify-between">
            <ul className="space-y-3 text-sm font-medium text-slate-600 mb-6">
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span> Track Individual Progress</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span> Course Registration Approval</li>
              <li className="flex items-center"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span> Mentoring Notes & Alerts</li>
            </ul>
            <Link href="/dashboard/advisor" className="block w-full text-center py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors">
              Access Advisory Portal
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}