'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpenCheck, CalendarCheck, ClipboardCheck, GraduationCap, ShieldCheck, Users, UsersRound, Wallet } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../utils/eligibility';
import { totalDue, type Student } from '../../utils/types';
import { useSessionUser } from '../../utils/useSessionUser';
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, table, taka } from '../components/ui';

// Only the HOD reaches this page — proxy.ts sends every other role to its own workspace.

const SEVERE_DEBT = 15000;
const FAILING_BACKLOGS = 3;

type Escalation = { student: Student; reason: string; tone: 'rose' | 'amber' | 'violet'; href: string; portal: string };

function escalationFor(s: Student): Escalation | null {
  const due = totalDue(s);
  if (s.exam_reg_status === 'Blocked') return { student: s, reason: 'Exam registration blocked', tone: 'rose', href: '/dashboard/exam', portal: 'Exams' };
  if (due > SEVERE_DEBT) return { student: s, reason: `Owes ${taka(due)}`, tone: 'amber', href: '/dashboard/studAff', portal: 'Finance' };
  if ((s.backlogs || 0) >= FAILING_BACKLOGS) return { student: s, reason: `${s.backlogs} backlogs`, tone: 'violet', href: '/dashboard/academic', portal: 'Academic' };
  return null;
}

const PORTALS = [
  { title: 'Finance & Student Affairs', href: '/dashboard/studAff', icon: Wallet, accent: 'from-emerald-500 to-teal-500', items: ['Fee rates & mass billing', 'Payments & receipts', 'Full payment history'] },
  { title: 'Academic Coordination', href: '/dashboard/academic', icon: BookOpenCheck, accent: 'from-indigo-500 to-blue-500', items: ['Courses & teachers', 'Attendance & CT marks', 'Notices to students'] },
  { title: 'Exam Control', href: '/dashboard/exam', icon: ClipboardCheck, accent: 'from-violet-500 to-purple-500', items: ['Eligibility checks', 'Registration status', 'Publish semester results'] },
  { title: 'Student Advisory', href: '/dashboard/advisor', icon: UsersRound, accent: 'from-sky-500 to-cyan-500', items: ['Advisee progress', 'Risk tracking', 'Escalations'] },
];

export default function HodDashboard() {
  const user = useSessionUser();
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

  const firstName = user?.name?.split(' ')[0];
  const list = students ?? [];
  const attendance = (s: Student) => s.attendance_percentage || 0;
  const outstanding = list.reduce((sum, s) => sum + totalDue(s), 0);
  const owing = list.filter((s) => totalDue(s) > 0).length;
  const avgAttendance = list.length ? Math.round(list.reduce((sum, s) => sum + attendance(s), 0) / list.length) : 0;
  const atRisk = list.filter((s) => attendance(s) < MIN_ATTENDANCE_PERCENT).length;
  const escalations = list.map(escalationFor).filter((e): e is Escalation => e !== null);
  const loading = students === null;

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Department overview'}
        description="Department of CSE at a glance — enrollment, money, attendance and who needs attention."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students enrolled" value={loading ? '—' : list.length} hint={`${courseCount} active courses`} icon={Users} tone="indigo" />
        <StatCard label="Outstanding dues" value={loading ? '—' : taka(outstanding)} hint={`${owing} students owe money`} icon={Wallet} tone="rose" />
        <StatCard label="Average attendance" value={loading ? '—' : `${avgAttendance}%`} hint={`Minimum is ${MIN_ATTENDANCE_PERCENT}%`} icon={CalendarCheck} tone="sky" />
        <StatCard label={`Below ${MIN_ATTENDANCE_PERCENT}% attendance`} value={loading ? '—' : atRisk} hint="At risk of exam block" icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Needs attention"
            description={`Exam blocked, owing more than ${taka(SEVERE_DEBT)}, or ${FAILING_BACKLOGS}+ backlogs`}
            icon={ShieldCheck}
            actions={<Badge tone={escalations.length ? 'rose' : 'emerald'}>{escalations.length} students</Badge>}
          />
          {escalations.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={loading ? 'Loading…' : 'Nothing needs attention'} body={loading ? undefined : 'No blocked registrations, severe debts or failing students right now.'} />
          ) : (
            <div className={`${table.wrap} max-h-[28rem] overflow-y-auto`}>
              <table className={table.table}>
                <thead className={`${table.head} sticky top-0 z-10`}>
                  <tr><th className={table.th}>Student</th><th className={table.th}>Advisor</th><th className={table.th}>Reason</th><th className={`${table.th} text-right`}>Handled in</th></tr>
                </thead>
                <tbody className={table.body}>
                  {escalations.map(({ student, reason, tone, href, portal }) => (
                    <tr key={student.id} className={table.row}>
                      <td className={table.td}>
                        <p className="font-medium text-slate-900">{student.name}</p>
                        <p className="text-xs text-slate-500">{student.college_id} · Sem {student.semester}</p>
                      </td>
                      <td className={`${table.td} text-slate-600`}>{student.advisor || '—'}</td>
                      <td className={table.td}><Badge tone={tone} dot>{reason}</Badge></td>
                      <td className={`${table.td} text-right`}>
                        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                          {portal} <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <h2 className="px-1 text-sm font-semibold text-slate-500">Department portals</h2>
          {PORTALS.map(({ title, href, icon: Icon, accent, items }) => (
            <Link key={href} href={href} className="group block">
              <Card className="flex items-center gap-4 p-4 transition-shadow group-hover:shadow-md group-hover:ring-slate-300">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${accent}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{title}</p>
                  <p className="truncate text-xs text-slate-500">{items.join(' · ')}</p>
                </div>
                <ArrowRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" aria-hidden />
              </Card>
            </Link>
          ))}
          <Card className="flex items-center gap-3 bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white ring-0">
            <GraduationCap className="size-8 shrink-0 opacity-80" aria-hidden />
            <p className="text-sm text-indigo-50">Course teachers enter CT marks in the <Link href="/teacher" className="font-semibold text-white underline underline-offset-2">Teacher portal</Link>.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
