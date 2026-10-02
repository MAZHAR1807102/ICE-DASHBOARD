'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../utils/eligibility';
import { totalDue, type Student } from '../../utils/types';
import PortalHeader from '../components/PortalHeader';

// Only the HOD reaches this page — proxy.ts sends every other role to its own workspace.

const SEVERE_DEBT = 15000;
const FAILING_BACKLOGS = 3;

type Escalation = { student: Student; reason: string; href: string };

function escalationFor(s: Student): Escalation | null {
  const due = totalDue(s);
  if (s.exam_reg_status === 'Blocked') return { student: s, reason: 'Exam registration blocked', href: '/dashboard/exam' };
  if (due > SEVERE_DEBT) return { student: s, reason: `Severe debt (৳${due.toLocaleString()})`, href: '/dashboard/studAff' };
  if ((s.backlogs || 0) >= FAILING_BACKLOGS) return { student: s, reason: `Academic failure (${s.backlogs} backlogs)`, href: '/dashboard/academic' };
  return null;
}

const PORTALS = [
  { title: 'Finance & Student Affairs', manager: 'Teacher 1', href: '/dashboard/studAff', color: 'emerald', items: ['Fee Structure Configuration', 'Batch-wide Mass Billing', 'Payment History & Receipts'] },
  { title: 'Academic Coordination', manager: 'Teacher 3', href: '/dashboard/academic', color: 'indigo', items: ['Curriculum Catalog', 'Bulk Attendance Processing', 'CT Mark Automations'] },
  { title: 'Exam Control & Results', manager: 'Teacher 2', href: '/dashboard/exam', color: 'purple', items: ['Eligibility Checks', 'Form Fill-up Management', 'Exam Registration Status'] },
  { title: 'Student Advisory', manager: 'Batch Advisors', href: '/dashboard/advisor', color: 'blue', items: ['Track Individual Progress', 'Course Registration Approval', 'Mentoring Notes & Alerts'] },
] as const;

const PORTAL_STYLE = {
  emerald: { header: 'bg-emerald-50/30', dot: 'bg-emerald-500', button: 'bg-emerald-600 hover:bg-emerald-700' },
  indigo: { header: 'bg-indigo-50/30', dot: 'bg-indigo-500', button: 'bg-indigo-600 hover:bg-indigo-700' },
  purple: { header: 'bg-purple-50/30', dot: 'bg-purple-500', button: 'bg-purple-600 hover:bg-purple-700' },
  blue: { header: 'bg-blue-50/30', dot: 'bg-blue-500', button: 'bg-blue-600 hover:bg-blue-700' },
};

export default function HodDashboard() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [courseCount, setCourseCount] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from('master_students').select('*'),
      supabase.from('courses').select('id', { count: 'exact', head: true }),
    ]).then(([studentRes, courseRes]) => {
      setStudents((studentRes.data as Student[]) ?? []);
      setCourseCount(courseRes.count ?? 0);
    });
  }, []);

  if (!students) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Loading department data</p>
      </div>
    );
  }

  const attendance = (s: Student) => s.attendance_percentage || 0;
  const outstanding = students.reduce((sum, s) => sum + totalDue(s), 0);
  const avgAttendance = students.length ? Math.round(students.reduce((sum, s) => sum + attendance(s), 0) / students.length) : 0;
  const atRisk = students.filter((s) => attendance(s) < MIN_ATTENDANCE_PERCENT).length;
  const escalations = students.map(escalationFor).filter((e): e is Escalation => e !== null);

  const metrics = [
    { label: 'Total Enrollment', value: students.length.toString(), style: 'text-slate-900' },
    { label: 'Total Outstanding Dues', value: `৳${outstanding.toLocaleString()}`, style: 'text-rose-600' },
    { label: 'Average Attendance', value: `${avgAttendance}%`, style: 'text-slate-900' },
    { label: `Students At Risk (<${MIN_ATTENDANCE_PERCENT}%)`, value: atRisk.toString(), style: 'text-rose-700' },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10 font-sans text-slate-800">
      <PortalHeader title="Department Overview" subtitle="Head of Department" />

      <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Executive Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">{m.label}</p>
            <p className={`text-3xl font-black ${m.style}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-6 mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-black text-rose-700">Escalations Needing Attention</h2>
          <span className="bg-rose-100 text-rose-800 text-xs px-2 py-1 rounded font-bold">{escalations.length} students</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Students whose exam registration is blocked, who owe more than ৳{SEVERE_DEBT.toLocaleString()}, or who have {FAILING_BACKLOGS}+ backlogs.
        </p>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="p-3 font-bold text-slate-500">College ID</th>
                <th className="p-3 font-bold text-slate-500">Name</th>
                <th className="p-3 font-bold text-slate-500">Advisor</th>
                <th className="p-3 font-bold text-slate-500">Reason</th>
                <th className="p-3 font-bold text-slate-500">Handled In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {escalations.map(({ student, reason, href }) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="p-3 text-slate-900">{student.college_id}</td>
                  <td className="p-3 font-medium text-slate-900">{student.name}</td>
                  <td className="p-3 text-slate-600">{student.advisor || '—'}</td>
                  <td className="p-3 text-rose-600 font-medium">{reason}</td>
                  <td className="p-3"><Link href={href} className="text-indigo-600 font-bold hover:underline">Open portal →</Link></td>
                </tr>
              ))}
              {escalations.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-emerald-600 font-medium">No escalations at this time.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Department Portals</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PORTALS.map((portal) => {
          const style = PORTAL_STYLE[portal.color];
          return (
            <div key={portal.href} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className={`p-6 border-b border-slate-100 ${style.header}`}>
                <h3 className="text-lg font-black text-slate-900">{portal.title}</h3>
                <p className="text-sm text-slate-500 font-medium mt-1">Managed by {portal.manager}</p>
              </div>
              <div className="p-6 flex-grow flex flex-col justify-between">
                <ul className="space-y-3 text-sm font-medium text-slate-600 mb-6">
                  {portal.items.map((item) => (
                    <li key={item} className="flex items-center"><span className={`w-1.5 h-1.5 rounded-full mr-2 ${style.dot}`}></span>{item}</li>
                  ))}
                  {portal.href === '/dashboard/academic' && (
                    <li className="flex items-center"><span className={`w-1.5 h-1.5 rounded-full mr-2 ${style.dot}`}></span>{courseCount} Active Courses</li>
                  )}
                </ul>
                <Link href={portal.href} className={`block w-full text-center py-2.5 text-white font-bold rounded-lg transition-colors ${style.button}`}>
                  Open {portal.title}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
