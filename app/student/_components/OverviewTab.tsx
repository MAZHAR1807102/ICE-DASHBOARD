import { MIN_ATTENDANCE_PERCENT, attendanceRecorded, studentExamStatus } from '../../../utils/eligibility';
import { semesterSummaries } from '../../../utils/grades';
import { totalDue } from '../../../utils/types';
import type { Profile } from './data';
import { GraduationCap } from 'lucide-react';
import GpaChart from './GpaChart';
import NoticesList from './NoticesList';
import { AttendanceBar, Card, EmptyState, taka } from './ui';

// ok: true = met, false = not met, null = not known yet (e.g. attendance not entered).
function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${ok === null ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden>
        {ok === null ? '…' : ok ? '✓' : '!'}
      </span>
      <div>
        <p className="text-sm font-bold text-slate-800">{label} <span className="sr-only">{ok === null ? '(not known yet)' : ok ? '(met)' : '(not met)'}</span></p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

export default function OverviewTab({ profile, onOpen }: { profile: Profile; onOpen: (tab: 'courses' | 'results' | 'payments' | 'notices') => void }) {
  const { student, courses, marks, results, official, opening, notices } = profile;
  const attendance = student.attendance_percentage || 0;
  const due = totalDue(student);
  const recorded = attendanceRecorded(student.attendance_percentage, courses.map((c) => marks[c.course_code]?.course_attendance));
  const status = studentExamStatus({ ...student, total_due: due }, recorded);
  const semesters = semesterSummaries(results, official, opening);
  const more = (tab: 'courses' | 'results' | 'payments' | 'notices', text: string) => (
    <button onClick={() => onOpen(tab)} className="shrink-0 whitespace-nowrap text-xs font-bold text-indigo-600 hover:text-indigo-800">{text} →</button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card
          className={status === 'eligible' ? 'ring-1 ring-emerald-200' : status === 'blocked' ? 'ring-1 ring-rose-200' : 'ring-1 ring-slate-200'}
          title="Final exam eligibility"
          action={
            <span className={`rounded-full px-3 py-1 text-xs font-black ${status === 'eligible' ? 'bg-emerald-100 text-emerald-800' : status === 'blocked' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
              {status === 'eligible' ? 'Eligible to register' : status === 'blocked' ? 'Not yet eligible' : 'Waiting for attendance'}
            </span>
          }
        >
          {student.eligibility_override ? (
            <p className="text-sm text-emerald-700 font-medium">✓ Approved by the academic coordinator.</p>
          ) : (
            <ul className="space-y-3">
              <Check
                ok={recorded ? attendance >= MIN_ATTENDANCE_PERCENT : null}
                label={`Attendance at least ${MIN_ATTENDANCE_PERCENT}%`}
                detail={recorded ? `Currently ${attendance}% across all courses` : 'Not recorded yet — it appears here once your teachers enter attendance'}
              />
              <Check ok={due <= 0} label="No outstanding dues" detail={due > 0 ? `${taka(due)} still to pay` : 'All fees cleared'} />
            </ul>
          )}
        </Card>

        <Card title="GPA and CGPA by semester" action={results.length > 0 && more('results', 'Full results')}>
          {semesters.length > 0
            ? <GpaChart points={semesters.map(({ semester, gpa, credits, cgpaAfter }) => ({ semester, gpa, credits, cgpa: cgpaAfter }))} />
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
                    <span className="text-sm font-bold text-slate-800 text-right tabular-nums">{recorded ? `${pct}%` : '—'}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-slate-400 mt-3">{recorded ? `The grey tick marks the ${MIN_ATTENDANCE_PERCENT}% minimum.` : 'Attendance has not been recorded for this semester yet.'}</p>
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
