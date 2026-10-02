'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FileDown, Plus, Save, Trash2, UserPlus, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Field, Tabs, cx, inputClass, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, type Course, type CourseResult } from '../../../../utils/types';
import { buildRollEntries, defaultMarksPerCredit, isTheoryCode, semesterTitle, sessionOf, type RollEntry, type RollSubject } from '../../../../utils/rollsheet';

type FullStudent = RollEntry['student'];
type Step = 'exam' | 'subjects' | 'students';

const GROUP_BADGE = { regular: { tone: 'slate', label: 'Regular' }, readd: { tone: 'amber', label: 'Readd' }, backlog: { tone: 'rose', label: 'Backlog' } } as const;

async function fetchAll<T>(build: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || (data as T[]).length < 1000) return rows;
  }
}

// Exams → Roll sheet: choose the exam, check the subject list, check who sits what, download Word.
export default function RollSheetModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('exam');
  const [semester, setSemester] = useState(1);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [label, setLabel] = useState('Regular');
  const [degreeLine, setDegreeLine] = useState('B.Sc. in Computer Science & Engineering (CSE)');
  const [marksPerCredit, setMarksPerCredit] = useState(String(defaultMarksPerCredit(1)));
  const [useDitto, setUseDitto] = useState(true);

  const [students, setStudents] = useState<FullStudent[] | null>(null);
  const [results, setResults] = useState<CourseResult[]>([]);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<RollSubject[]>([]);
  const [subjectsSaved, setSubjectsSaved] = useState(true);
  const [entries, setEntries] = useState<RollEntry[]>([]);
  const [addRoll, setAddRoll] = useState('');
  const [busy, setBusy] = useState(false);

  // Everything the sheet needs, loaded once.
  useEffect(() => {
    Promise.all([
      fetchAll<FullStudent>((from) => supabase.from('master_students').select('id, name, ru_id, college_id, semester, name_bn, mother_name, father_name, session').range(from, from + 999)),
      fetchAll<CourseResult>((from) => supabase.from('course_results').select('*').range(from, from + 999)),
      supabase.from('courses').select('*'),
    ])
      .then(([s, r, c]) => { setStudents(s); setResults(r); setCatalog((c.data ?? []) as Course[]); })
      .catch((err) => toast.error(`Could not load data: ${err.message}`));
  }, [toast]);

  const examLine = `${semesterTitle(semester)} Final Examination ${year}`;
  const [examLineEdit, setExamLineEdit] = useState<string | null>(null);

  // Subject list: the saved one, or a starting point from the course list + published results.
  const loadSubjects = async (sem: number) => {
    const { data } = await supabase.from('roll_sheet_subjects').select('*').eq('semester', sem).order('position');
    if (data && data.length) {
      setSubjects(data.map((d) => ({ course_code: d.course_code, title: d.title, credit: d.credit === null ? null : Number(d.credit), is_theory: d.is_theory, position: d.position })));
      setSubjectsSaved(true);
      return;
    }
    const found = new Map<string, RollSubject>();
    catalog.filter((c) => c.semester === sem).forEach((c) => {
      const code = c.course_code.toUpperCase().replace(/\s+/g, '');
      found.set(code, { course_code: code, title: c.course_name, credit: c.credit, is_theory: isTheoryCode(code), position: 0 });
    });
    results.filter((r) => r.semester === sem).forEach((r) => {
      const code = r.course_code.toUpperCase();
      if (!found.has(code)) found.set(code, { course_code: code, title: r.course_name ?? '', credit: Number(r.credit), is_theory: isTheoryCode(code), position: 0 });
    });
    // RU's usual order: non-CSE theory, then CSE theory, then labs — each by course number.
    const rank = (s: RollSubject) => (s.is_theory ? (s.course_code.startsWith('CSE') ? 1 : 0) : 2);
    const number = (s: RollSubject) => s.course_code.replace(/\D/g, '');
    const list = [...found.values()].sort((a, b) => rank(a) - rank(b) || number(a).localeCompare(number(b)) || a.course_code.localeCompare(b.course_code)).map((s, i) => ({ ...s, position: i }));
    setSubjects(list);
    setSubjectsSaved(false);
  };

  const goToSubjects = async () => {
    setExamLineEdit((v) => v ?? null);
    await loadSubjects(semester);
    setStep('subjects');
  };

  const goToStudents = () => {
    if (!students) return;
    const clean = subjects.filter((s) => s.course_code.trim());
    if (clean.length === 0) return toast.error('Add at least one subject.');
    setEntries(buildRollEntries(semester, clean.map((s, i) => ({ ...s, position: i })), students, results));
    setStep('students');
  };

  const saveSubjects = async () => {
    setBusy(true);
    const rows = subjects.filter((s) => s.course_code.trim()).map((s, i) => ({ semester, position: i, course_code: s.course_code.toUpperCase().replace(/\s+/g, ''), title: s.title.trim(), credit: s.credit, is_theory: s.is_theory }));
    const del = await supabase.from('roll_sheet_subjects').delete().eq('semester', semester);
    const ins = del.error ? del : await supabase.from('roll_sheet_subjects').insert(rows);
    setBusy(false);
    if (ins.error) return toast.error(`Subject list not saved: ${ins.error.message}`);
    setSubjectsSaved(true);
    toast.success(`Semester ${semester} subject list saved for next time.`);
  };

  const updateSubject = (i: number, patch: Partial<RollSubject>) => { setSubjects(subjects.map((s, j) => (j === i ? { ...s, ...patch } : s))); setSubjectsSaved(false); };
  const moveSubject = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= subjects.length) return;
    const next = [...subjects];
    [next[i], next[j]] = [next[j], next[i]];
    setSubjects(next);
    setSubjectsSaved(false);
  };

  const toggleSubject = (studentId: string, code: string) => setEntries(entries.map((e) => (e.student.id !== studentId ? e : {
    ...e, subjects: e.subjects.includes(code) ? e.subjects.filter((c) => c !== code) : subjects.map((s) => s.course_code).filter((c) => c === code || e.subjects.includes(c)),
  })));

  const addStudent = () => {
    const s = students?.find((x) => x.ru_id?.trim() === addRoll.trim() || x.college_id === addRoll.trim());
    if (!s) return toast.error(`No student with RU ID or College ID "${addRoll}".`);
    if (entries.some((e) => e.student.id === s.id)) return toast.info(`${s.name || s.ru_id} is already on the sheet.`);
    setEntries([...entries, { student: s, group: 'backlog', subjects: subjects.map((x) => x.course_code) }]);
    setAddRoll('');
  };

  const listed = entries.filter((e) => e.subjects.length > 0);
  const missingDetails = useMemo(() => listed.filter((e) => !e.student.name_bn || !e.student.mother_name || !e.student.father_name), [listed]);
  const counts = { regular: listed.filter((e) => e.group === 'regular').length, readd: listed.filter((e) => e.group === 'readd').length, backlog: listed.filter((e) => e.group === 'backlog').length };

  const download = async () => {
    setBusy(true);
    try {
      const { buildRollSheetDocx } = await import('../../../../utils/rollsheet-docx');
      const blob = await buildRollSheetDocx({
        degreeLine, examLine: examLineEdit ?? examLine, label, subjects: subjects.map((s, i) => ({ ...s, position: i })),
        entries: listed, marksPerCredit: Number(marksPerCredit) || defaultMarksPerCredit(semester), useDitto,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Roll Sheet - ${(examLineEdit ?? examLine).replace(/[\\/:*?"<>|]/g, '')} (${label}).docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Roll sheet downloaded — ${listed.length} students.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const small = cx(inputClass, 'h-8 px-2 text-xs');

  return (
    <Modal title="Roll sheet" description="Generate the RU exam roll sheet (Word) for any semester." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <Tabs
          value={step}
          onChange={(s) => (s === 'exam' ? setStep('exam') : s === 'subjects' ? goToSubjects() : goToStudents())}
          tabs={[{ id: 'exam', label: '1 · Exam' }, { id: 'subjects', label: '2 · Subjects' }, { id: 'students', label: '3 · Students' }]}
        />

        {step === 'exam' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Semester">
                <select value={semester} onChange={(e) => { const s = Number(e.target.value); setSemester(s); setMarksPerCredit(String(defaultMarksPerCredit(s))); setExamLineEdit(null); }} className={inputClass}>
                  {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n} — {semesterTitle(n)}</option>)}
                </select>
              </Field>
              <Field label="Exam year"><input value={year} onChange={(e) => { setYear(e.target.value); setExamLineEdit(null); }} className={inputClass} inputMode="numeric" /></Field>
              <Field label="Roll sheet type"><input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="Regular" /></Field>
            </div>
            <Field label="Title lines (as printed)">
              <input value={degreeLine} onChange={(e) => setDegreeLine(e.target.value)} className={cx(inputClass, 'mb-2')} />
              <input value={examLineEdit ?? examLine} onChange={(e) => setExamLineEdit(e.target.value)} className={inputClass} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Theory marks per credit" hint="17.5 → 2 cr = 35, 3 cr = 52.5 · 20 → 3 cr = 60">
                <input type="number" step="0.5" value={marksPerCredit} onChange={(e) => setMarksPerCredit(e.target.value)} className={inputClass} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={useDitto} onChange={(e) => setUseDitto(e.target.checked)} className="size-4 rounded border-slate-300 text-indigo-600" />
                Write &ldquo;,,&rdquo; when a student&apos;s subjects are the same as the one above
              </label>
            </div>
            <Button className="w-full" loading={!students} onClick={goToSubjects}>Next: subjects</Button>
          </div>
        )}

        {step === 'subjects' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Every subject of the <b>{semesterTitle(semester)}</b> exam, in the order printed. Labs (codes ending in an even digit) print without credit and marks.
              {!subjectsSaved && <span className="text-amber-700"> Not saved yet — save it so next time starts from this list.</span>}
            </p>
            <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Type</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody className={table.body}>
                  {subjects.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5"><input value={s.course_code} onChange={(e) => { const code = e.target.value.toUpperCase(); updateSubject(i, { course_code: code, is_theory: isTheoryCode(code) }); }} className={cx(small, 'w-28 font-mono')} aria-label="Course code" /></td>
                      <td className="px-3 py-1.5"><input value={s.title} onChange={(e) => updateSubject(i, { title: e.target.value })} className={cx(small, 'min-w-60', !s.title.trim() && 'ring-amber-400')} aria-label="Course title" placeholder="Course title" /></td>
                      <td className="px-3 py-1.5"><input type="number" step="0.25" value={s.credit ?? ''} onChange={(e) => updateSubject(i, { credit: e.target.value === '' ? null : Number(e.target.value) })} className={cx(small, 'w-16 text-center')} aria-label="Credit" /></td>
                      <td className="px-3 py-1.5">
                        <select value={s.is_theory ? 'theory' : 'lab'} onChange={(e) => updateSubject(i, { is_theory: e.target.value === 'theory' })} className={cx(small, 'w-24')} aria-label="Type">
                          <option value="theory">Theory</option><option value="lab">Lab</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        <Button size="xs" variant="ghost" icon={ArrowUp} onClick={() => moveSubject(i, -1)} aria-label="Move up" />
                        <Button size="xs" variant="ghost" icon={ArrowDown} onClick={() => moveSubject(i, 1)} aria-label="Move down" />
                        <Button size="xs" variant="ghost" icon={Trash2} onClick={() => { setSubjects(subjects.filter((_, j) => j !== i)); setSubjectsSaved(false); }} aria-label="Remove subject" className="hover:bg-rose-50 hover:text-rose-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {subjects.some((s) => !s.title.trim()) && (
              <p className="flex items-center gap-2 text-xs text-amber-800"><AlertTriangle className="size-3.5" aria-hidden />{subjects.filter((s) => !s.title.trim()).length} subject{subjects.filter((s) => !s.title.trim()).length === 1 ? ' has' : 's have'} no title yet — type it in and save the list.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => { setSubjects([...subjects, { course_code: '', title: '', credit: 3, is_theory: true, position: subjects.length }]); setSubjectsSaved(false); }}>Add subject</Button>
              <Button size="sm" variant="secondary" icon={Save} loading={busy} disabled={subjectsSaved} onClick={saveSubjects}>{subjectsSaved ? 'Saved' : 'Save subject list'}</Button>
            </div>
            <Button className="w-full" onClick={goToStudents}>Next: students</Button>
          </div>
        )}

        {step === 'students' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="slate">{counts.regular} regular</Badge>
              <Badge tone="amber">{counts.readd} readd</Badge>
              <Badge tone="rose">{counts.backlog} backlog</Badge>
              <span className="text-slate-500">Click a subject to take it off (or put it back on) for that student.</span>
            </div>
            {missingDetails.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {missingDetails.length} student{missingDetails.length === 1 ? ' is' : 's are'} missing a Bangla name or parents&apos; names — those lines print blank. Add them in Academic → Edit, or import them from an earlier roll sheet.
              </p>
            )}
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
              {entries.map((e) => {
                const off = e.subjects.length === 0;
                return (
                  <div key={e.student.id} className={cx('rounded-lg px-3 py-2 ring-1 ring-slate-200', off && 'opacity-50')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-sm font-semibold text-slate-900">{e.student.ru_id ?? e.student.college_id}</span>
                        <span className="ml-2 text-sm text-slate-700">{e.student.name || '—'}</span>
                        <span className="ml-2 text-xs text-slate-400">{sessionOf(e.student)} · now Sem {e.student.semester}</span>
                        <span className="ml-2"><Badge tone={GROUP_BADGE[e.group].tone}>{GROUP_BADGE[e.group].label}</Badge></span>
                      </div>
                      <Button size="xs" variant="ghost" icon={X} onClick={() => setEntries(entries.filter((x) => x.student.id !== e.student.id))} aria-label={`Remove ${e.student.ru_id}`} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {subjects.map((s) => {
                        const on = e.subjects.includes(s.course_code);
                        return (
                          <button key={s.course_code} onClick={() => toggleSubject(e.student.id, s.course_code)}
                            className={cx('rounded px-1.5 py-0.5 font-mono text-[11px]', on ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'bg-slate-50 text-slate-300 line-through')}>
                            {s.course_code}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input value={addRoll} onChange={(e) => setAddRoll(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStudent()} placeholder="Add a student by RU ID or College ID" className={inputClass} />
              <Button variant="secondary" icon={UserPlus} onClick={addStudent}>Add</Button>
            </div>
            <Button className="w-full" icon={FileDown} loading={busy} disabled={listed.length === 0} onClick={download}>
              Download roll sheet (Word) — {listed.length} students
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
