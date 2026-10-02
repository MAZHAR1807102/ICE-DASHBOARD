import { GraduationCap, History } from 'lucide-react';
import { formatGpa, semesterSummaries, standingThrough } from '../../../utils/grades';
import { DEGREE_CREDITS, type AcademicOpening, type CourseResult, type SemesterResult } from '../../../utils/types';
import { Badge } from '../../components/ui';
import GpaChart from './GpaChart';
import { Card, EmptyState, GradeChip } from './ui';

const STATUS_TONE: Record<string, 'emerald' | 'amber' | 'rose'> = { pass: 'emerald', cond: 'amber', fail: 'rose' };

export function DegreeProgress({ earned }: { earned: number }) {
  const pct = Math.min(100, (earned / DEGREE_CREDITS) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <span>Degree progress</span>
        <span><b className="text-slate-800">{earned}</b> / {DEGREE_CREDITS} credits</span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100" role="meter" aria-valuenow={earned} aria-valuemin={0} aria-valuemax={DEGREE_CREDITS} aria-label="Credits earned towards the degree">
        <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ResultsTab({ results, official, opening }: { results: CourseResult[]; official: SemesterResult[]; opening: AcademicOpening | null }) {
  if (results.length === 0 && official.length === 0 && !opening) {
    return (
      <Card>
        <EmptyState icon={GraduationCap} title="No results published yet" body="Your semester results will appear here as soon as the exam office publishes them." />
      </Card>
    );
  }

  const semesters = semesterSummaries(results, official, opening);
  const standing = standingThrough(results, opening);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">CGPA so far</p>
          <p className="mt-1 text-3xl font-black text-slate-900">{standing.creditsCounted ? standing.cgpa.toFixed(3) : '—'}<span className="text-base font-bold text-slate-400"> / 4.00</span></p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Credits earned</p>
          <p className="mt-1 text-3xl font-black text-slate-900">{standing.creditsEarned}</p>
          <div className="mt-3"><DegreeProgress earned={standing.creditsEarned} /></div>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Backlogs</p>
          <p className={`mt-1 text-3xl font-black ${standing.backlogs.length ? 'text-rose-600' : 'text-slate-900'}`}>{standing.backlogs.length}</p>
          {standing.backlogs.length > 0
            ? <p className="mt-1 text-xs text-rose-600">{standing.backlogs.join(', ')} — counted as 0.00 until passed</p>
            : <p className="mt-1 text-xs text-slate-500">No failed courses outstanding</p>}
        </Card>
      </div>

      {semesters.length > 0 && (
        <Card title="GPA and CGPA by semester">
          <GpaChart points={semesters.map(({ semester, gpa, credits, cgpaAfter }) => ({ semester, gpa, credits, cgpa: cgpaAfter }))} />
        </Card>
      )}

      {[...semesters].reverse().map((s) => (
        <Card
          key={s.semester}
          title={`Semester ${s.semester}`}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
              {s.official?.result_status && <Badge tone={STATUS_TONE[s.official.result_status.toLowerCase()] ?? 'slate'} dot>{s.official.result_status === 'Cond' ? 'Conditional' : s.official.result_status}</Badge>}
              {s.official?.merit_position && <Badge tone="violet">Merit #{s.official.merit_position}</Badge>}
              <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-black text-indigo-700">GPA {s.official?.gpa != null ? Number(s.official.gpa).toFixed(3) : formatGpa(s.gpa)}</span>
            </div>
          }
        >
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Credits this semester', value: `${s.earned}${s.credits ? `/${s.credits}` : ''}` },
              { label: 'Year GPA', value: s.official?.ygpa != null ? Number(s.official.ygpa).toFixed(3) : '—' },
              { label: 'CGPA after this semester', value: s.cgpaAfter ? s.cgpaAfter.toFixed(3) : '—', strong: true },
              { label: 'Credits completed', value: `${s.creditsAfter}/${DEGREE_CREDITS}` },
            ].map((t) => (
              <div key={t.label} className={`rounded-lg px-3 py-2 ${t.strong ? 'bg-teal-50 ring-1 ring-teal-100' : 'bg-slate-50'}`}>
                <p className="text-[11px] text-slate-500">{t.label}</p>
                <p className={`font-bold tabular-nums ${t.strong ? 'text-teal-800' : 'text-slate-800'}`}>{t.value}</p>
              </div>
            ))}
          </div>
          {s.official?.exam_title && <p className="mb-3 text-xs text-slate-500">{s.official.exam_title}</p>}
          {s.results.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No course grades for this semester — absent or withheld.</p>}
          {s.results.length > 0 && (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-1 py-2 font-bold">Course</th>
                    <th className="px-1 py-2 text-center font-bold">Credit</th>
                    <th className="px-1 py-2 text-center font-bold">Grade</th>
                    <th className="px-1 py-2 text-right font-bold">Point</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {s.results.map((r) => {
                    const superseded = opening && s.semester <= opening.through_semester ? false : !s.counted.has(r.id);
                    return (
                      <tr key={r.id} className={superseded ? 'opacity-50' : ''}>
                        <td className="px-1 py-2.5">
                          <span className="font-bold text-slate-800">{r.course_code}</span>
                          {r.course_name && <span className="block text-xs text-slate-500">{r.course_name}</span>}
                          {superseded && <span className="block text-[11px] text-slate-500">Replaced by a better attempt</span>}
                        </td>
                        <td className="px-1 py-2.5 text-center text-slate-700">{Number(r.credit)}</td>
                        <td className="px-1 py-2.5 text-center"><GradeChip grade={r.grade} /></td>
                        <td className="px-1 py-2.5 text-right font-mono text-slate-700">{Number(r.grade_point).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      {opening && (
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><History className="size-5" aria-hidden /></span>
            <div>
              <p className="font-semibold text-slate-900">{opening.through_semester === 1 ? 'Semester 1' : `Semesters 1–${opening.through_semester}`} (earlier results)</p>
              <p className="text-sm text-slate-600">{Number(opening.credits)} credits completed · CGPA {Number(opening.cgpa).toFixed(3)} — carried forward from your RU results before this portal.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
