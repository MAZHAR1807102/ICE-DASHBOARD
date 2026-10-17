'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileDown, Info } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Field, cx, inputClass, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { classifyCohorts, orderByCohort } from '../../../../utils/cohort';
import { ctCount, ctMax } from '../../../../utils/ct';
import { isTheoryCode, semesterTitle } from '../../../../utils/rollsheet';
import { DEFAULT_BANDS, caMarks, caRow, fmt, yearSemesterLine, type AttendanceRule } from '../../../../utils/ca-sheet';
import { SEMESTERS, type Course, type CtMark, type Student } from '../../../../utils/types';

type Person = Pick<Student, 'id' | 'name' | 'ru_id' | 'college_id' | 'semester'>;
type Override = { cts?: (number | null)[]; attendance?: number | null };

const code = (c: string) => c.toUpperCase().replace(/\s+/g, '');
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

// Exams → CA mark sheet: the theory-course Mark Sheet with CTs, CT average, attendance marks and
// CA total filled in from the portal. Any number can be corrected here before downloading.
export default function CaSheetModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [students, setStudents] = useState<Person[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [marks, setMarks] = useState<CtMark[]>([]);
  const [semester, setSemester] = useState(1);
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [department, setDepartment] = useState('Department of Computer Science and Engineering (CSE), RU');
  const [signDate, setSignDate] = useState('');
  const [rule, setRule] = useState<AttendanceRule>({ mode: 'bands', bands: DEFAULT_BANDS });
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('master_students').select('id, name, ru_id, college_id, semester').eq('status', 'active'),
      supabase.from('courses').select('*').order('course_code'),
      supabase.from('ct_marks').select('*'),
    ]).then(([s, c, m]) => {
      if (s.error || c.error) return toast.error(`Could not load data: ${(s.error ?? c.error)!.message}`);
      setStudents((s.data ?? []) as Person[]);
      setCourses((c.data ?? []) as Course[]);
      setMarks((m.data ?? []) as CtMark[]);
    });
  }, [toast]);

  const theory = useMemo(() => courses.filter((c) => c.semester === semester && isTheoryCode(c.course_code)), [courses, semester]);
  const cohorts = useMemo(() => classifyCohorts(students ?? []), [students]);

  // Each course's sheet: the semester's students (Regular, then Readd) plus anyone with CT marks in it.
  const sheets = useMemo(() => theory.map((course) => {
    const c = code(course.course_code);
    const credit = Number(course.credit) || 3;
    const n = ctCount({ credit });
    const byStudent = new Map(marks.filter((m) => code(m.course_code) === c).map((m) => [m.student_id, m]));
    const people = orderByCohort((students ?? []).filter((s) => s.semester === course.semester || byStudent.has(s.id)), cohorts);
    const rows = people.map((s) => {
      const m = byStudent.get(s.id);
      const o = overrides[`${c}|${s.id}`] ?? {};
      const fromPortal = m ? [m.ct1, m.ct2, m.ct3, m.ct4].slice(0, n).map(num) : Array(n).fill(null);
      const anyCt = fromPortal.some((x) => x !== null && x !== 0);
      const cts = o.cts ?? (anyCt ? fromPortal : Array(n).fill(null));
      const attendancePercent = o.attendance !== undefined ? o.attendance : m && Number(m.course_attendance) > 0 ? Number(m.course_attendance) : null;
      return { student: s, attendancePercent, row: caRow({ roll: s.ru_id?.trim() || s.college_id, cts, attendancePercent }, credit, rule) };
    });
    return { course, code: c, credit, n, rows };
  }), [theory, marks, students, cohorts, overrides, rule]);

  const chosen = sheets.filter((s) => include[s.code] !== false);
  const setOverride = (c: string, id: string, patch: Override) => setOverrides((o) => ({ ...o, [`${c}|${id}`]: { ...o[`${c}|${id}`], ...patch } }));

  const download = async () => {
    if (chosen.length === 0) return toast.error('Choose at least one course.');
    setBusy(true);
    try {
      const { buildCaSheetDocx } = await import('../../../../utils/ca-sheet');
      const blob = await buildCaSheetDocx({
        department, examYear, date: signDate.trim() || undefined,
        courses: chosen.map((s) => ({ course_code: s.code, title: s.course.course_name.trim(), credit: s.credit, semester: s.course.semester, rows: s.rows.map((r) => r.row) })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const lines = [...new Set(chosen.map((c) => yearSemesterLine(c.code, c.course.semester)))];
      a.download = `CA Mark Sheet - ${lines.length === 1 ? lines[0] : semesterTitle(semester)} ${examYear}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`CA mark sheet downloaded — ${chosen.length} courses.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const small = cx(inputClass, 'h-8 px-1.5 text-center text-xs');
  const detail = sheets.find((s) => s.code === open);

  return (
    <Modal title="CA mark sheet" description="The theory-course Mark Sheet (Word) with class tests, attendance and CA totals filled in from the portal." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Semester">
            <select value={semester} onChange={(e) => { setSemester(Number(e.target.value)); setOpen(''); }} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>{n} · {semesterTitle(n)}</option>)}
            </select>
          </Field>
          <Field label="Exam year">
            <input value={examYear} onChange={(e) => setExamYear(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Attendance marks" className="col-span-2">
            <select value={rule.mode} onChange={(e) => setRule({ ...rule, mode: e.target.value as AttendanceRule['mode'] })} className={inputClass}>
              <option value="bands">From attendance % (bands below)</option>
              <option value="full">Full marks for everyone</option>
              <option value="blank">Leave blank</option>
            </select>
          </Field>
          <Field label="Department line" className="col-span-2 sm:col-span-3">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Date (signature line)">
            <input value={signDate} onChange={(e) => setSignDate(e.target.value)} placeholder="e.g. 30-08-2026" className={inputClass} />
          </Field>
        </div>

        {rule.mode === 'bands' && (
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="mb-2 text-xs font-semibold text-slate-600">Attendance % → share of attendance marks</p>
            <div className="flex flex-wrap gap-2">
              {rule.bands.map((b, i) => (
                <label key={i} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
                  ≥
                  <input type="number" value={b.min} onChange={(e) => setRule({ ...rule, bands: rule.bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} className={cx(small, 'w-12')} aria-label="From attendance %" />
                  % →
                  <input type="number" value={b.share} onChange={(e) => setRule({ ...rule, bands: rule.bands.map((x, j) => (j === i ? { ...x, share: Number(e.target.value) } : x)) })} className={cx(small, 'w-12')} aria-label="Share of marks %" />
                  %
                </label>
              ))}
              <span className="self-center text-xs text-slate-500">below {Math.min(...rule.bands.map((b) => b.min))}% → 0</span>
            </div>
          </div>
        )}

        {!students ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading courses and marks…</p>
        ) : sheets.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No theory courses for semester {semester}. Add them in Academic → Curriculum.</p>
        ) : (
          <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2 text-center">CTs entered</th>
                  <th className="px-3 py-2 text-center">Attendance entered</th>
                  <th className="px-3 py-2 text-right"><span className="sr-only">Check</span></th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {sheets.map((s) => {
                  const withCt = s.rows.filter((r) => r.row.ctAverage !== null).length;
                  const withAtt = s.rows.filter((r) => r.attendancePercent !== null).length;
                  return (
                    <tr key={s.code} className={cx(include[s.code] === false && 'opacity-50')}>
                      <td className="px-3 py-2"><input type="checkbox" checked={include[s.code] !== false} onChange={(e) => setInclude({ ...include, [s.code]: e.target.checked })} className="size-4" aria-label={`Include ${s.code}`} /></td>
                      <td className="px-3 py-2">
                        <p className="font-mono text-xs font-semibold text-slate-900">{s.code} <span className="font-sans font-normal text-slate-500">· {s.credit} credits · {s.n} CTs</span></p>
                        <p className="text-sm text-slate-700">{s.course.course_name}</p>
                      </td>
                      <td className="px-3 py-2 text-center"><Badge tone={withCt === s.rows.length ? 'emerald' : withCt ? 'amber' : 'slate'}>{withCt} / {s.rows.length}</Badge></td>
                      <td className="px-3 py-2 text-center"><Badge tone={withAtt === s.rows.length ? 'emerald' : withAtt ? 'amber' : 'slate'}>{withAtt} / {s.rows.length}</Badge></td>
                      <td className="px-3 py-2 text-right"><Button size="xs" variant={open === s.code ? 'primary' : 'secondary'} onClick={() => setOpen(open === s.code ? '' : s.code)}>{open === s.code ? 'Close' : 'Check marks'}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {detail && (
          <div className="rounded-xl ring-1 ring-indigo-200">
            <p className="flex items-center gap-1.5 border-b border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
              <Info className="size-3.5 shrink-0" aria-hidden />
              {detail.code}: corrections here go into this download only. Teachers&apos; marks in the portal are not changed.
            </p>
            <div className={`${table.wrap} max-h-[45vh] overflow-y-auto`}>
              <table className={table.table}>
                <thead className={`${table.head} sticky top-0 z-10`}>
                  <tr>
                    <th className="px-3 py-2">Roll</th>
                    {Array.from({ length: detail.n }, (_, i) => <th key={i} className="px-1 py-2 text-center">CT-{i + 1} ({fmt(ctMax({ credit: detail.credit }))})</th>)}
                    <th className="px-2 py-2 text-center">Avg ({fmt(caMarks(detail.credit).ct)})</th>
                    <th className="px-2 py-2 text-center">Attend. %</th>
                    <th className="px-2 py-2 text-center">Marks ({fmt(caMarks(detail.credit).attendance)})</th>
                    <th className="px-2 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {detail.rows.map(({ student, row, attendancePercent }) => (
                    <tr key={student.id}>
                      <td className="px-3 py-1.5"><p className="font-mono text-xs">{row.roll}</p><p className="max-w-40 truncate text-[11px] text-slate-500">{student.name}</p></td>
                      {row.cts.map((ct, i) => (
                        <td key={i} className="px-1 py-1.5">
                          <div className="w-14">
                            <input type="number" step="0.5" min={0} max={ctMax({ credit: detail.credit })} value={ct ?? ''}
                              onChange={(e) => setOverride(detail.code, student.id, { cts: row.cts.map((x, j) => (j === i ? num(e.target.value) : x)) })}
                              className={small} aria-label={`CT-${i + 1} for ${row.roll}`} />
                          </div>
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center font-semibold tabular-nums">{fmt(row.ctAverage) || '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="mx-auto w-16">
                          <input type="number" min={0} max={100} value={attendancePercent ?? ''} onChange={(e) => setOverride(detail.code, student.id, { attendance: num(e.target.value) })} className={small} aria-label={`Attendance % for ${row.roll}`} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{fmt(row.attendance) || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold tabular-nums">{fmt(row.total) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">CT average = all CTs ÷ number of CTs, to the nearest 0.5. Total = CT average + attendance marks.</p>
          <Button icon={FileDown} loading={busy} disabled={chosen.length === 0} onClick={download}>Download CA mark sheet (Word)</Button>
        </div>
      </div>
    </Modal>
  );
}
