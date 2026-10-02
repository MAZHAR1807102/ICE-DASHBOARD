import { academicStanding, formatGpa, semesterSummaries } from '../../../utils/grades';
import type { CourseResult } from '../../../utils/types';
import GpaChart from './GpaChart';
import { Card, EmptyState, GradeChip } from './ui';

export default function ResultsTab({ results }: { results: CourseResult[] }) {
  if (results.length === 0) {
    return (
      <Card>
        <EmptyState icon="🎓" title="No results published yet" body="Your semester results will appear here as soon as the exam office publishes them." />
      </Card>
    );
  }

  const semesters = semesterSummaries(results);
  const standing = academicStanding(results);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><p className="text-xs font-bold uppercase tracking-wider text-slate-400">CGPA</p><p className="text-3xl font-black text-slate-900 mt-1">{formatGpa(standing.cgpa)}<span className="text-base font-bold text-slate-400"> / 4.00</span></p></Card>
        <Card><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Credits earned</p><p className="text-3xl font-black text-slate-900 mt-1">{standing.creditsEarned}</p></Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Backlogs</p>
          <p className={`text-3xl font-black mt-1 ${standing.backlogs.length ? 'text-rose-600' : 'text-slate-900'}`}>{standing.backlogs.length}</p>
          {standing.backlogs.length > 0 && <p className="text-xs text-rose-600 mt-1">{standing.backlogs.join(', ')}</p>}
        </Card>
      </div>

      <Card title="GPA by semester">
        <GpaChart points={semesters.map(({ semester, gpa, credits }) => ({ semester, gpa, credits }))} />
      </Card>

      {[...semesters].reverse().map((s) => (
        <Card
          key={s.semester}
          title={`Semester ${s.semester}`}
          action={
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">{s.earned}/{s.credits} credits</span>
              <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-black text-indigo-700">GPA {formatGpa(s.gpa)}</span>
            </div>
          }
        >
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 px-1 font-bold">Course</th>
                  <th className="py-2 px-1 font-bold text-center">Credit</th>
                  <th className="py-2 px-1 font-bold text-center">Grade</th>
                  <th className="py-2 px-1 font-bold text-right">Point</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {s.results.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 px-1">
                      <span className="font-bold text-slate-800">{r.course_code}</span>
                      {r.course_name && <span className="block text-xs text-slate-500">{r.course_name}</span>}
                    </td>
                    <td className="py-2.5 px-1 text-center text-slate-700">{Number(r.credit)}</td>
                    <td className="py-2.5 px-1 text-center"><GradeChip grade={r.grade} /></td>
                    <td className="py-2.5 px-1 text-right font-mono text-slate-700">{Number(r.grade_point).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
