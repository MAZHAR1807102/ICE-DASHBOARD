'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, Plus, Shuffle, Trash2, Users } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, cx, inputClass, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { classifyCohorts, orderByCohort } from '../../../../utils/cohort';
import { isTheoryCode, semesterTitle } from '../../../../utils/rollsheet';
import { ctCount } from '../../../../utils/ct';
import { caMarks, caTotalMax, filledRow, fmt, seededRandom, showsEachCt, yearSemesterLine, type CaCourse, type CaRow } from '../../../../utils/ca-sheet';
import { SEMESTERS, isRunning, type Course, type Student } from '../../../../utils/types';

type Person = Pick<Student, 'id' | 'name' | 'ru_id' | 'college_id' | 'semester'>;
type CourseLine = { key: number; code: string; title: string; credit: string; teacher: string; include: boolean };

const numbers = (text: string) => text.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const rollsFrom = (text: string) => [...new Set(text.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean))];

// Exams → Custom CA sheet: a CA Mark Sheet for any exam — also old or irregular ones whose courses,
// students or marks are not in the portal. Courses and rolls are typed or loaded; marks are left
// blank or filled in (full attendance, CA totals picked at random from the values given).
// Totals are given for a 3-credit course and scaled to 2 and 4 credits (nearest 0.5).
export default function CustomCaSheetModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [students, setStudents] = useState<Person[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [semester, setSemester] = useState(1);
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [department, setDepartment] = useState('Department of Computer Science and Engineering (CSE), RU');
  const [signDate, setSignDate] = useState('');
  const [courses, setCourses] = useState<CourseLine[]>([]);
  const [rollText, setRollText] = useState('');
  const [fill, setFill] = useState<'blank' | 'random'>('blank');
  const [totalsText, setTotalsText] = useState('21, 21.5');
  const [seed, setSeed] = useState(1);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('master_students').select('id, name, ru_id, college_id, semester').eq('status', 'active'),
      supabase.from('courses').select('*').order('course_code'),
    ]).then(([s, c]) => {
      if (s.error || c.error) return toast.error(`Could not load data: ${(s.error ?? c.error)!.message}`);
      setStudents((s.data ?? []) as Person[]);
      setAllCourses((c.data ?? []) as Course[]);
    });
  }, [toast]);

  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const nextKey = () => Math.max(0, ...courses.map((c) => c.key)) + 1;

  const loadCourses = () => {
    const theory = allCourses.filter((c) => c.semester === semester && isTheoryCode(c.course_code) && isRunning(c));
    if (!theory.length) return toast.error(`No running theory courses for semester ${semester} in Curriculum — add them below by hand.`);
    let key = nextKey();
    setCourses(theory.map((c) => ({ key: key++, code: c.course_code.trim(), title: c.course_name.trim(), credit: String(c.credit ?? 3), teacher: c.teacher_name?.trim() ?? '', include: true })));
  };
  const loadStudents = () => {
    const list = orderByCohort(students.filter((s) => s.semester === semester), cohorts);
    if (!list.length) return toast.error(`No students in semester ${semester}.`);
    setRollText(list.map((s) => s.ru_id?.trim() || s.college_id).join('\n'));
  };
  const setCourse = (key: number, patch: Partial<CourseLine>) => setCourses((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const rolls = useMemo(() => rollsFrom(rollText), [rollText]);
  const chosen = useMemo(() => courses.filter((c) => c.include && c.code.trim()), [courses]);
  const totals = useMemo(() => numbers(totalsText), [totalsText]);
  const totalsFor = (credit: number) => totals.map((t) => Math.round(((t * credit) / 3) * 2) / 2);

  // One page per course (more when it has more students than fit on a page).
  const pages = useMemo(() => {
    const rand = seededRandom(seed);
    return chosen.map((c) => {
      const credit = Number(c.credit) || 3;
      const n = ctCount({ credit });
      const scaled = totals.map((t) => Math.round(((t * credit) / 3) * 2) / 2);
      const rows: CaRow[] = rolls.map((roll) => (fill === 'random'
        ? filledRow(roll, credit, scaled, rand)
        : { roll, cts: Array(n).fill(null), ctAverage: null, attendance: null, total: null }));
      return { key: c.key, course: c, credit, rows };
    });
  }, [chosen, rolls, fill, totals, seed]);

  const unreachable = fill === 'random' && rolls.length > 0 && pages.some((p) => p.rows.some((r) => r.total === null));

  const download = async () => {
    if (!chosen.length) return toast.error('Add at least one course.');
    if (!rolls.length) return toast.error('Add the students’ rolls.');
    setBusy(true);
    try {
      const { buildCaSheetDocx } = await import('../../../../utils/ca-sheet');
      const list: CaCourse[] = pages.map((p) => ({
        course_code: p.course.code.trim(), title: p.course.title.trim(), credit: p.credit, semester,
        rows: p.rows, teacher: p.course.teacher.trim() || undefined,
      }));
      const blob = await buildCaSheetDocx({ department, examYear, date: signDate.trim() || undefined, courses: list });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CA Mark Sheet - ${yearSemesterLine(chosen[0].code, semester)} ${examYear}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`CA mark sheet downloaded — ${chosen.length} courses, ${rolls.length} students.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const small = cx(inputClass, 'h-8 px-2 text-xs');
  const shown = pages.filter((p) => p.key === preview);

  return (
    <Modal title="Custom CA sheet" description="A CA Mark Sheet (Word) for any exam — courses and rolls you choose, marks left blank or filled in." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Semester">
            <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>{n} · {semesterTitle(n)}</option>)}
            </select>
          </Field>
          <Field label="Exam year">
            <input value={examYear} onChange={(e) => setExamYear(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Date (signature line)" className="col-span-2">
            <input value={signDate} onChange={(e) => setSignDate(e.target.value)} placeholder="Leave empty to write by hand" className={inputClass} />
          </Field>
          <Field label="Department line" className="col-span-2 sm:col-span-4">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {/* Courses */}
        <section className="rounded-xl ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">Courses</p>
              <p className="text-xs text-slate-500">One page per course. The year and semester heading comes from the course code.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={Download} onClick={loadCourses}>Load semester {semester} courses</Button>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCourses([...courses, { key: nextKey(), code: '', title: '', credit: '3', teacher: '', include: true }])}>Add course</Button>
            </div>
          </div>
          {courses.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No courses yet — load them from Curriculum or add them by hand (e.g. an older syllabus).</p>
          ) : (
            <div className={table.wrap}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr>
                    <th className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                    <th className="px-2 py-2">Code</th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Credits</th>
                    <th className="px-2 py-2">Teacher (Name on the sheet)</th>
                    <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {courses.map((c) => (
                    <tr key={c.key} className={cx(!c.include && 'opacity-50')}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={c.include} onChange={(e) => setCourse(c.key, { include: e.target.checked })} className="size-4" aria-label={`Include ${c.code}`} /></td>
                      <td className="px-2 py-1.5"><div className="w-24"><input value={c.code} onChange={(e) => setCourse(c.key, { code: e.target.value })} placeholder="CSE3211" className={cx(small, 'font-mono')} aria-label="Course code" /></div></td>
                      <td className="px-2 py-1.5"><div className="min-w-56"><input value={c.title} onChange={(e) => setCourse(c.key, { title: e.target.value })} placeholder="Course title" className={small} aria-label="Course title" /></div></td>
                      <td className="px-2 py-1.5">
                        <div className="w-16">
                          <select value={c.credit} onChange={(e) => setCourse(c.key, { credit: e.target.value })} className={small} aria-label="Credits">
                            {['2', '3', '4'].map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-1.5"><div className="min-w-40"><input value={c.teacher} onChange={(e) => setCourse(c.key, { teacher: e.target.value })} placeholder="Blank = write by hand" className={small} aria-label="Teacher" /></div></td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="xs" variant={preview === c.key ? 'primary' : 'ghost'} onClick={() => setPreview(preview === c.key ? null : c.key)}>{preview === c.key ? 'Close' : 'Preview'}</Button>
                          <Button size="xs" variant="ghost" icon={Trash2} onClick={() => setCourses(courses.filter((x) => x.key !== c.key))} aria-label={`Remove ${c.code}`} className="hover:bg-rose-50 hover:text-rose-600" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Students */}
        <Field label={`Students' rolls (${rolls.length})`} hint="One roll per line, in the order they should be printed. Anything after the roll on a line is ignored.">
          <textarea rows={6} value={rollText} onChange={(e) => setRollText(e.target.value)} placeholder={'2238520101\n2238520105\n2038520142'} className={cx(inputClass, 'font-mono')} />
          <Button size="xs" variant="secondary" icon={Users} onClick={loadStudents} className="mt-2">Load semester {semester} students</Button>
        </Field>

        {/* Marks */}
        <section className="space-y-3 rounded-xl p-4 ring-1 ring-slate-200">
          <Field label="Marks">
            <select value={fill} onChange={(e) => setFill(e.target.value as 'blank' | 'random')} className={inputClass}>
              <option value="blank">Leave blank — fill in by hand</option>
              <option value="random">Full attendance, CA totals picked at random from the values below</option>
            </select>
          </Field>
          {fill === 'random' && (
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="CA totals to pick from (for a 3-credit course)" hint={`Out of ${fmt(caTotalMax(3))} (CT average ${fmt(caMarks(3).ct)} + attendance ${fmt(caMarks(3).attendance)}). 2- and 4-credit courses get the same totals scaled: ${totalsFor(2).map(fmt).join(', ') || '—'} of ${fmt(caTotalMax(2))} and ${totalsFor(4).map(fmt).join(', ') || '—'} of ${fmt(caTotalMax(4))}.`}>
                <input value={totalsText} onChange={(e) => setTotalsText(e.target.value)} placeholder="21, 21.5" className={inputClass} />
              </Field>
              <Button variant="secondary" icon={Shuffle} onClick={() => setSeed(seed + 1)} className="mb-5">Shuffle again</Button>
            </div>
          )}
          {unreachable && <p className="text-xs font-medium text-rose-600">Some totals don&apos;t fit (above the maximum or below full attendance) — those rows stay blank. Check the totals.</p>}
        </section>

        {shown.map((p) => {
          const m = caMarks(p.credit);
          const each = showsEachCt(p.course.code, semester);
          const n = each ? ctCount({ credit: p.credit }) : 0;
          return (
            <div key={p.key} className="rounded-xl ring-1 ring-indigo-200">
              <p className="border-b border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-900">
                {p.course.code} · Theory {fmt(m.theory)}, CT {fmt(m.ct)}, Attendance {fmt(m.attendance)} · {p.rows.length} students
              </p>
              <div className={`${table.wrap} max-h-64 overflow-y-auto`}>
                <table className={table.table}>
                  <thead className={`${table.head} sticky top-0`}>
                    <tr>
                      <th className="px-3 py-1.5">Roll</th>
                      {Array.from({ length: n }, (_, i) => <th key={i} className="px-2 py-1.5 text-center">CT-{i + 1}</th>)}
                      <th className="px-2 py-1.5 text-center">{each ? 'CT avg' : 'Class Test'}</th>
                      <th className="px-2 py-1.5 text-center">Attendance</th>
                      <th className="px-2 py-1.5 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className={table.body}>
                    {p.rows.map((r) => (
                      <tr key={r.roll}>
                        <td className="px-3 py-1 font-mono text-xs">{r.roll}</td>
                        {r.cts.slice(0, n).map((c, i) => <td key={i} className="px-2 py-1 text-center tabular-nums">{fmt(c) || '—'}</td>)}
                        <td className="px-2 py-1 text-center tabular-nums">{fmt(r.ctAverage) || '—'}</td>
                        <td className="px-2 py-1 text-center tabular-nums">{fmt(r.attendance) || '—'}</td>
                        <td className="px-2 py-1 text-center font-semibold tabular-nums">{fmt(r.total) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Nothing here is saved to the portal — it only makes the Word file. The Theory column is always left for the examiners.</p>
          <Button icon={FileDown} loading={busy} disabled={!chosen.length || !rolls.length} onClick={download}>Download CA mark sheet (Word)</Button>
        </div>
      </div>
    </Modal>
  );
}
