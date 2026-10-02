'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser, signOut } from '../../utils/session';
import { MIN_ATTENDANCE_PERCENT, isExamEligible } from '../../utils/eligibility';
import { academicStanding, formatGpa } from '../../utils/grades';
import { totalDue } from '../../utils/types';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { loadProfile, type Profile } from './_components/data';
import OverviewTab from './_components/OverviewTab';
import CoursesTab from './_components/CoursesTab';
import ResultsTab from './_components/ResultsTab';
import PaymentsTab from './_components/PaymentsTab';
import NoticesList from './_components/NoticesList';
import { Card, taka } from './_components/ui';

type Tab = 'overview' | 'courses' | 'results' | 'payments' | 'notices';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'courses', label: 'Courses & CT' },
  { id: 'results', label: 'Results' },
  { id: 'payments', label: 'Payments' },
  { id: 'notices', label: 'Notices' },
];

function Stat({ label, value, sub, tone = 'text-slate-900' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white/95 border border-white/60 shadow-sm px-4 py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-2xl font-black mt-0.5 tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-slate-500 truncate">{sub}</p>
    </div>
  );
}

export default function StudentPortal() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);

  useEffect(() => {
    getSessionUser().then((user) => {
      if (!user?.studentId) {
        router.replace('/student-login');
        return;
      }
      loadProfile(user.studentId).then(setProfile);
    });
  }, [router]);

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading your profile…</p>
      </div>
    );
  }

  const { student, courses, results, transactions, notices } = profile;
  const standing = academicStanding(results);
  const due = totalDue(student);
  const attendance = student.attendance_percentage || 0;
  const eligible = isExamEligible({ ...student, total_due: due });
  const creditsInProgress = courses.reduce((sum, c) => sum + Number(c.credit), 0);
  const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* TOP BAR */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[11px] font-black">ICE</div>
            <span className="font-black text-slate-900 whitespace-nowrap">Student Space</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => setIsPasswordOpen(true)} className="whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><span className="hidden sm:inline">Change </span>Password</button>
            <button onClick={() => signOut('/student-login')} className="whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">Log out</button>
          </div>
        </div>
      </header>

      {/* PROFILE HERO */}
      <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600">
        <div className="max-w-6xl mx-auto px-4 pt-8 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-20 h-20 shrink-0 rounded-2xl bg-white/15 ring-4 ring-white/20 flex items-center justify-center text-3xl font-black text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-white">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{student.name}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${eligible ? 'bg-emerald-400/90 text-emerald-950' : 'bg-rose-400/90 text-rose-950'}`}>
                  {eligible ? '● Exam eligible' : '● Exam blocked'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-indigo-100">
                <span>RU ID <b className="text-white">{student.ru_id || '—'}</b></span>
                <span>College ID <b className="text-white">{student.college_id}</b></span>
                <span>Semester <b className="text-white">{student.semester}</b></span>
                <span>Advisor <b className="text-white">{student.advisor || 'Not assigned'}</b></span>
              </div>
              {(student.student_contact || student.guardian_contact) && (
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-indigo-200">
                  {student.student_contact && <span>📱 {student.student_contact}</span>}
                  {student.guardian_contact && <span>Guardian: {student.guardian_contact}</span>}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="CGPA" value={results.length ? formatGpa(standing.cgpa) : '—'} sub={results.length ? 'out of 4.00' : 'No results yet'} />
            <Stat label="Credits earned" value={String(standing.creditsEarned)} sub={`${creditsInProgress} in progress this semester`} />
            <Stat
              label="Attendance"
              value={`${attendance}%`}
              sub={attendance >= MIN_ATTENDANCE_PERCENT ? `Above the ${MIN_ATTENDANCE_PERCENT}% minimum` : `Below the ${MIN_ATTENDANCE_PERCENT}% minimum`}
              tone={attendance >= MIN_ATTENDANCE_PERCENT ? 'text-emerald-600' : 'text-rose-600'}
            />
            <Stat label="Fees due" value={taka(due)} sub={due > 0 ? 'Outstanding balance' : 'All clear'} tone={due > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          </div>
        </div>
      </div>

      {/* TABS */}
      <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-3.5 text-sm font-bold border-b-2 transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {t.label}
              {t.id === 'notices' && notices.length > 0 && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{notices.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'overview' && <OverviewTab profile={profile} onOpen={setTab} />}
        {tab === 'courses' && <CoursesTab semester={student.semester} courses={courses} marks={profile.marks} />}
        {tab === 'results' && <ResultsTab results={results} />}
        {tab === 'payments' && <PaymentsTab student={student} transactions={transactions} />}
        {tab === 'notices' && <Card title="Department notices"><NoticesList notices={notices} /></Card>}
      </main>

      {isPasswordOpen && <ChangePasswordModal onClose={() => setIsPasswordOpen(false)} />}
    </div>
  );
}
