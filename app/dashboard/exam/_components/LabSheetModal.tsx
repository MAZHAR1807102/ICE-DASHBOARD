'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileDown, Plus, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Field, cx, inputClass, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { SEMESTERS } from '../../../../utils/types';
import { buildRollEntries, semesterTitle, type RollSubject } from '../../../../utils/rollsheet';
import { loadExamData, loadSubjectList, type ExamData } from '../../../../utils/rollsheet-data';
import { defaultLabMarks, type LabMarks } from '../../../../utils/labsheet-docx';

type LabRow = { course_code: string; title: string; credit: number | null; include: boolean; marks: LabMarks; internal: string; external: string };

const toLabRow = (s: Pick<RollSubject, 'course_code' | 'title' | 'credit'>, teacher = ''): LabRow => ({
  course_code: s.course_code, title: s.title, credit: s.credit, include: true, marks: defaultLabMarks(s.credit), internal: teacher, external: '',
});

// Exams → Lab mark sheet: one page per 13 students of every lab course, for the examiners to fill in.
export default function LabSheetModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ExamData | null>(null);
  const [semester, setSemester] = useState(1);
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [department, setDepartment] = useState('Department of Computer Science and Engineering, RU');
  const [rowsPerPage, setRowsPerPage] = useState('13');
  const [fillAttendance, setFillAttendance] = useState(false);
  const [subjects, setSubjects] = useState<RollSubject[]>([]);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadExamData().then(setData).catch((err) => toast.error(`Could not load data: ${err.message}`));
  }, [toast]);

  // The semester's lab courses come from the same subject list as the roll sheet.
  useEffect(() => {
    if (!data) return;
    loadSubjectList(semester, data).then(({ subjects }) => {
      setSubjects(subjects);
      // The internal examiner starts as the course teacher from Academic → Curriculum.
      const code = (c: string) => c.toUpperCase().replace(/\s+/g, '');
      const teacher = (c: string) => data.catalog.find((x) => x.semester === semester && code(x.course_code) === code(c))?.teacher_name?.trim()
        ?? data.catalog.find((x) => code(x.course_code) === code(c))?.teacher_name?.trim() ?? '';
      setLabs(subjects.filter((s) => !s.is_theory).map((s) => toLabRow(s, teacher(s.course_code))));
    });
  }, [data, semester]);

  // Who sits each lab: the semester's Regular and Readd students, then backlogs with an F in it.
  const rollsByCourse = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;
    const all = [...subjects.filter((s) => s.is_theory), ...labs.map((l, i) => ({ course_code: l.course_code, title: l.title, credit: l.credit, is_theory: false, position: 1000 + i }))];
    const entries = buildRollEntries(semester, all, data.students, data.results);
    labs.forEach((l) => map.set(l.course_code, entries.filter((e) => e.subjects.includes(l.course_code)).map((e) => e.student.ru_id?.trim() || e.student.college_id)));
    return map;
  }, [data, subjects, labs, semester]);

  const update = (i: number, patch: Partial<LabRow>) => setLabs(labs.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const updateMarks = (i: number, key: keyof LabMarks, value: string) => update(i, { marks: { ...labs[i].marks, [key]: Number(value) || 0 } });

  const chosen = labs.filter((l) => l.include && l.course_code.trim());
  const missingTitles = chosen.filter((l) => !l.title.trim());
  const perPage = Math.max(1, Number(rowsPerPage) || 13);
  const pages = chosen.reduce((sum, l) => sum + Math.max(1, Math.ceil((rollsByCourse.get(l.course_code)?.length ?? 0) / perPage)), 0);

  const download = async () => {
    if (chosen.length === 0) return toast.error('Choose at least one lab course.');
    setBusy(true);
    try {
      const { buildLabSheetDocx } = await import('../../../../utils/labsheet-docx');
      const blob = await buildLabSheetDocx({
        department, semester, examYear, rowsPerPage: perPage, fillAttendance,
        courses: chosen.map((l) => ({ course_code: l.course_code.trim(), title: l.title.trim(), marks: l.marks, internal: l.internal.trim(), external: l.external.trim(), rolls: rollsByCourse.get(l.course_code) ?? [] })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Lab Mark Sheet - ${semesterTitle(semester)} ${examYear}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Lab mark sheet downloaded — ${chosen.length} courses, ${pages} pages.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const small = cx(inputClass, 'h-8 px-2 text-xs');

  return (
    <Modal title="Lab mark sheet" description="Blank lab mark sheets (Word) for the examiners: every lab course of a semester, 13 students a page." size="xl" onClose={onClose}>
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
          <Field label="Students per page">
            <input type="number" min={1} max={30} value={rowsPerPage} onChange={(e) => setRowsPerPage(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Attendance (AT)">
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={fillAttendance} onChange={(e) => setFillAttendance(e.target.checked)} className="size-4" />
              Print full AT marks
            </label>
          </Field>
          <Field label="Department line" className="col-span-2 sm:col-span-4">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {!data ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading students and courses…</p>
        ) : (
          <>
            <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr>
                    <th className="px-3 py-2 w-8"><span className="sr-only">Include</span></th>
                    <th className="px-2 py-2">Lab course</th>
                    <th className="px-2 py-2 text-center">Exp · CT · AT</th>
                    <th className="px-2 py-2">Examiners</th>
                    <th className="px-3 py-2 text-right">Students</th>
                    <th className="px-2 py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {labs.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No lab courses found for semester {semester}. Add them below, or in Roll sheet → Subjects.</td></tr>
                  )}
                  {labs.map((l, i) => {
                    const rolls = rollsByCourse.get(l.course_code) ?? [];
                    const total = l.marks.experiment + l.marks.ct + l.marks.at;
                    return (
                      <tr key={i} className={cx('align-top', !l.include && 'opacity-50')}>
                        <td className="px-3 py-2"><input type="checkbox" checked={l.include} onChange={(e) => update(i, { include: e.target.checked })} className="mt-2 size-4" aria-label={`Include ${l.course_code}`} /></td>
                        <td className="min-w-48 px-2 py-2">
                          <input value={l.course_code} onChange={(e) => update(i, { course_code: e.target.value.toUpperCase().replace(/\s+/g, '') })} className={cx(small, 'font-mono')} aria-label="Course code" />
                          <input value={l.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Course title" className={cx(small, 'mt-1', !l.title.trim() && 'ring-amber-300 bg-amber-50')} aria-label="Course title" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {(['experiment', 'ct', 'at'] as const).map((k) => (
                              <div key={k} className="w-14 shrink-0">
                                <input type="number" step="0.5" min={0} value={l.marks[k]} onChange={(e) => updateMarks(i, k, e.target.value)} className={cx(small, 'text-center')} aria-label={k === 'experiment' ? 'Experiment marks' : k === 'ct' ? 'CT marks' : 'AT marks'} />
                              </div>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Total {total}</p>
                        </td>
                        <td className="min-w-40 px-2 py-2">
                          <input value={l.internal} onChange={(e) => update(i, { internal: e.target.value })} placeholder="Internal examiner" className={small} aria-label="Internal examiner" />
                          <input value={l.external} onChange={(e) => update(i, { external: e.target.value })} placeholder="External examiner" className={cx(small, 'mt-1')} aria-label="External examiner" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <details className="text-xs">
                            <summary className="cursor-pointer font-semibold text-slate-900">{rolls.length}</summary>
                            <p className="mt-1 max-w-48 text-left font-mono leading-5 text-slate-500">{rolls.join(', ') || '—'}</p>
                          </details>
                        </td>
                        <td className="px-2 py-2"><Button size="xs" variant="ghost" icon={Trash2} onClick={() => setLabs(labs.filter((_, j) => j !== i))} aria-label={`Remove ${l.course_code}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setLabs([...labs, toLabRow({ course_code: '', title: '', credit: 1 })])}>Add lab course</Button>

            {missingTitles.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {missingTitles.map((l) => l.course_code).join(', ')} {missingTitles.length === 1 ? 'has' : 'have'} no course title. Type it above, or save titles once in Roll sheet → Subjects.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="indigo">{chosen.length} lab courses</Badge>
                <Badge tone="slate">{pages} pages</Badge>
              </div>
              <Button icon={FileDown} loading={busy} disabled={chosen.length === 0} onClick={download}>Download lab mark sheet (Word)</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
