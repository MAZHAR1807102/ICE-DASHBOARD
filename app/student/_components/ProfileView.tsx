'use client';

import { useState } from 'react';
import { MIN_ATTENDANCE_PERCENT, isExamEligible } from '../../../utils/eligibility';
import { academicStanding } from '../../../utils/grades';
import { DEGREE_CREDITS, isActive, totalDue } from '../../../utils/types';
import type { Profile } from '../../../utils/profile';
import OverviewTab from './OverviewTab';
import CoursesTab from './CoursesTab';
import ResultsTab from './ResultsTab';
import PaymentsTab from './PaymentsTab';
import NoticesList from './NoticesList';
import { Card, taka } from './ui';

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

// The student portal below the top bar. Staff see the same view through "View as student".
export default function ProfileView({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('overview');
  const { student, courses, results, transactions, notices } = profile;
  const standing = academicStanding(results, profile.opening);
  const hasStanding = standing.creditsCounted > 0;
  const due = totalDue(student);
  const attendance = student.attendance_percentage || 0;
  const eligible = isExamEligible({ ...student, total_due: due });
  const creditsInProgress = courses.reduce((sum, c) => sum + Number(c.credit), 0);
  const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <>
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
                {isActive(student)
                  ? <span>Semester <b className="text-white">{student.semester}</b></span>
                  : <span><b className="text-white">Graduated</b>{student.graduated_at ? ` ${new Date(student.graduated_at).getFullYear()}` : ''}</span>}
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
            <Stat label="CGPA" value={hasStanding ? standing.cgpa.toFixed(2) : '—'} sub={hasStanding ? `Running, through semester ${Math.max(profile.opening?.through_semester ?? 0, ...results.map((r) => r.semester))}` : 'No results yet'} />
            <Stat label="Credits earned" value={`${standing.creditsEarned} / ${DEGREE_CREDITS}`} sub={`${creditsInProgress} in progress this semester`} />
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
        {tab === 'results' && <ResultsTab results={results} official={profile.official} opening={profile.opening} />}
        {tab === 'payments' && <PaymentsTab student={student} transactions={transactions} />}
        {tab === 'notices' && <Card title="Department notices"><NoticesList notices={notices} /></Card>}
      </main>
    </>
  );
}
