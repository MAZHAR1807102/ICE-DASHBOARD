'use client';

import { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Field, cx, inputClass, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { classifyCohorts, orderByCohort } from '../../../../utils/cohort';
import { semesterTitle, sessionOf } from '../../../../utils/rollsheet';
import { DEFAULT_DAYS, DEFAULT_ROWS_PER_PAGE, attendanceSemesterLine } from '../../../../utils/attendance-sheet';
import { SEMESTERS, isRunning, type Course, type Student } from '../../../../utils/types';

const code = (c: string) => c.toUpperCase().replace(/\s+/g, '');

// Academic → Attendance sheet: a blank Student Attendance Sheet (Word) for every running course of
// the chosen semester, with the semester's students (Regular, then Readd) listed by roll.
export default function AttendanceSheetModal({ students, courses, initialSemester, onClose }: {
  students: Student[]; // active students (all semesters, so Regular/Readd is worked out correctly)
  courses: Course[];
  initialSemester: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const [semester, setSemester] = useState(initialSemester);
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [batchEdits, setBatchEdits] = useState<Record<number, string>>({});
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [rowsPerPage, setRowsPerPage] = useState(String(DEFAULT_ROWS_PER_PAGE));
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [instructors, setInstructors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const people = useMemo(() => orderByCohort(students.filter((s) => s.semester === semester), cohorts), [students, semester, cohorts]);
  const semCourses = useMemo(
    () => courses.filter((c) => c.semester === semester && isRunning(c)).sort((a, b) => code(a.course_code).localeCompare(code(b.course_code))),
    [courses, semester],
  );

  // Section/Batch: the session most Regular students of the semester belong to (e.g. 2023-24).
  const autoBatch = useMemo(() => {
    const counts = new Map<string, number>();
    people.filter((s) => cohorts.get(s.id) !== 'readd').forEach((s) => {
      const session = sessionOf(s);
      if (session) counts.set(session, (counts.get(session) ?? 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [people, cohorts]);
  const batch = batchEdits[semester] ?? autoBatch;

  const key = (c: Course) => `${semester}|${code(c.course_code)}`;
  const chosen = semCourses.filter((c) => include[key(c)] !== false);
  const perPage = Math.max(1, Number(rowsPerPage) || DEFAULT_ROWS_PER_PAGE);
  const pagesPerCourse = Math.max(1, Math.ceil(people.length / perPage));

  const download = async () => {
    if (chosen.length === 0) return toast.error('Choose at least one course.');
    if (people.length === 0) return toast.error(`There are no students in semester ${semester}.`);
    setBusy(true);
    try {
      const { buildAttendanceSheetDocx } = await import('../../../../utils/attendance-sheet');
      const list = people.map((s) => ({ name: s.name?.trim() ?? '', roll: s.ru_id?.trim() || s.college_id }));
      const blob = await buildAttendanceSheetDocx({
        batch: batch.trim(),
        academicYear: academicYear.trim(),
        days: Number(days) || DEFAULT_DAYS,
        rowsPerPage: perPage,
        courses: chosen.map((c) => ({
          course_code: code(c.course_code),
          title: c.course_name.trim(),
          instructor: (instructors[key(c)] ?? c.teacher_name ?? '').trim(),
          semesterLine: attendanceSemesterLine(code(c.course_code), semester),
          students: list,
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance Sheet - ${semesterTitle(semester)}${batch.trim() ? ` ${batch.trim()}` : ''}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Attendance sheet downloaded — ${chosen.length} course${chosen.length === 1 ? '' : 's'}, ${people.length} students.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const small = cx(inputClass, 'h-8 px-2 text-xs');
  const readdCount = people.filter((s) => cohorts.get(s.id) === 'readd').length;

  return (
    <Modal title="Attendance sheet" description="A blank Student Attendance Sheet (Word, A4 landscape) for every course of a semester, with the semester's students listed by roll." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Field label="Semester" className="col-span-2">
            <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>{n} · {semesterTitle(n)}</option>)}
            </select>
          </Field>
          <Field label="Section/Batch">
            <input value={batch} onChange={(e) => setBatchEdits({ ...batchEdits, [semester]: e.target.value })} placeholder="2023-24" className={inputClass} />
          </Field>
          <Field label="Academic year">
            <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Class days">
            <input type="number" min={1} max={31} value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>
                <th className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                <th className="px-2 py-2">Course</th>
                <th className="px-2 py-2">Instructor (printed on the sheet)</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {semCourses.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-500">No running courses in semester {semester}. Add them in the Curriculum tab.</td></tr>
              )}
              {semCourses.map((c) => {
                const on = include[key(c)] !== false;
                return (
                  <tr key={c.course_code} className={cx(!on && 'opacity-50')}>
                    <td className="px-3 py-2"><input type="checkbox" checked={on} onChange={(e) => setInclude({ ...include, [key(c)]: e.target.checked })} className="size-4" aria-label={`Include ${c.course_code}`} /></td>
                    <td className="px-2 py-2">
                      <span className="font-mono text-xs text-slate-500">{code(c.course_code)}</span>
                      <span className="ml-2 text-sm text-slate-900">{c.course_name}</span>
                    </td>
                    <td className="min-w-48 px-2 py-2">
                      <input
                        value={instructors[key(c)] ?? c.teacher_name ?? ''}
                        onChange={(e) => setInstructors({ ...instructors, [key(c)]: e.target.value })}
                        placeholder="Not assigned — leave blank or type a name"
                        className={small}
                        aria-label={`Instructor for ${c.course_code}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="indigo">{chosen.length} course{chosen.length === 1 ? '' : 's'}</Badge>
            <Badge tone="slate">{people.length} students{readdCount ? ` (${readdCount} Readd)` : ''}</Badge>
            <Badge tone="slate">{chosen.length * pagesPerCourse} page{chosen.length * pagesPerCourse === 1 ? '' : 's'}</Badge>
            <label className="ml-1 flex items-center gap-2 text-xs text-slate-600">
              Students per page
              <input type="number" min={1} max={30} value={rowsPerPage} onChange={(e) => setRowsPerPage(e.target.value)} className={cx(small, 'w-16')} />
            </label>
          </div>
          <Button icon={FileDown} loading={busy} disabled={chosen.length === 0 || people.length === 0} onClick={download}>Download attendance sheet (Word)</Button>
        </div>
      </div>
    </Modal>
  );
}
