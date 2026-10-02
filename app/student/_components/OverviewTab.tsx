import { MIN_ATTENDANCE_PERCENT, isExamEligible } from '../../../utils/eligibility';
import { semesterSummaries } from '../../../utils/grades';
import { totalDue } from '../../../utils/types';
import type { Profile } from './data';
import { GraduationCap } from 'lucide-react';
import GpaChart from './GpaChart';
import NoticesList from './NoticesList';
import { AttendanceBar, Card, EmptyState, taka } from './ui';

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden>
        {ok ? '✓' : '!'}
      </span>
      <div>
        <p className="text-sm font-bold text-slate-800">{label} <span className="sr-only">{ok ? '(met)' : '(not met)'}</span></p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

export default function OverviewTab({ profile, onOpen }: { profile: Profile; onOpen: (tab: 'courses' | 'results' | 'payments' | 'notices') => void }) {
  const { student, courses, marks, results, notices } = profile;
  const attendance = student.attendance_percentage || 0;
  const due = totalDue(student);
  const eligible = isExamEligible({ ...student, total_due: due });
  const semesters = semesterSummaries(results);
  const more = (tab: 'courses' | 'results' | 'payments' | 'notices', text: string) => (
    <button onClick={() => onOpen(tab)} className="shrink-0 whitespace-nowrap text-xs font-bold text-indigo-600 hover:text-indigo-800">{text} →</button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card
          className={eligible ? 'ring-1 ring-emerald-200' : 'ring-1 ring-rose-200'}
          title="Final exam eligibility"
          action={
            <span className={`rounded-full px-3 py-1 text-xs font-black ${eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
              {eligible ? 'Eligible to register' : 'Not yet eligible'}
            </span>
          }
        >
          {student.eligibility_override ? (
            <p className="text-sm text-emerald-700 font-medium">✓ Approved by the academic coordinator.</p>
          ) : (
            <ul className="space-y-3">
              <Check ok={attendance >= MIN_ATTENDANCE_PERCENT} label={`Attendance at least ${MIN_ATTENDANCE_PERCENT}%`} detail={`Currently ${attendance}% across all courses`} />
              <Check ok={due <= 0} label="No outstanding dues" detail={due > 0 ? `${taka(due)} still to pay` : 'All fees cleared'} />
            </ul>
          )}
        </Card>

        <Card title="GPA by semester" action={results.length > 0 && more('results', 'Full results')}>
          {semesters.length > 0
            ? <GpaChart points={semesters.map(({ semester, gpa, credits }) => ({ semester, gpa, credits }))} />
            : <EmptyState icon={GraduationCap} title="No results published yet" body="Your GPA trend will appear once semester results are published." />}
        </Card>

        <Card title={`This semester's attendance`} action={courses.length > 0 && more('courses', 'Courses & CT marks')}>
          {courses.length === 0 ? (
            <p className="text-sm text-slate-500">No courses have been added for your semester yet.</p>
          ) : (
            <ul className="space-y-3">
              {courses.map((c) => {
                const pct = Number(marks[c.course_code]?.course_attendance) || 0;
                return (
                  <li key={c.id} className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-3">
                    <span className="text-sm font-bold text-slate-700 truncate" title={c.course_name}>{c.course_code}</span>
                    <AttendanceBar percent={pct} />
                    <span className="text-sm font-bold text-slate-800 text-right tabular-nums">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-slate-400 mt-3">The grey tick marks the {MIN_ATTENDANCE_PERCENT}% minimum.</p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Fees" action={more('payments', 'History')}>
          <p className={`text-3xl font-black ${due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{taka(due)}</p>
          <p className="text-xs text-slate-500 mt-1">{due > 0 ? 'Outstanding balance' : 'Nothing owed — all clear'}</p>
        </Card>
        <Card title="Latest notices" action={notices.length > 3 && more('notices', 'All notices')}>
          <NoticesList notices={notices} limit={3} />
        </Card>
      </div>
    </div>
  );
}
