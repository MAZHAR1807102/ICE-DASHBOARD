'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileDown, Info, UserPlus, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Field, inputClass } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { SEMESTERS } from '../../../../utils/types';
import { buildRollEntries, semesterTitle, sessionOf, type RollEntry, type RollSubject } from '../../../../utils/rollsheet';
import { loadExamData, loadSubjectList, type ExamData } from '../../../../utils/rollsheet-data';
import { admitExamLine, admitRowFromEntry, admitShortSemester } from '../../../../utils/admit-card';

const GROUP_BADGE = { regular: { tone: 'slate', label: 'Regular' }, readd: { tone: 'amber', label: 'Readd' }, backlog: { tone: 'rose', label: 'Backlog' } } as const;
const ORDER = { regular: 0, readd: 1, backlog: 2 } as const;

// Exams → Admit card distribution: everyone sitting a semester's final exam (the same examinees as
// the roll sheet — Regular, Readd, and later-semester students with an F in its subjects), with a
// box for each to sign when they collect their admit card.
export default function AdmitCardModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ExamData | null>(null);
  const [semester, setSemester] = useState(1);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [degreeLine, setDegreeLine] = useState('B.Sc. in Computer Science & Engineering (CSE)');
  const [loaded, setLoaded] = useState<{ semester: number; subjects: RollSubject[] } | null>(null);
  const [examLineEdits, setExamLineEdits] = useState<Record<number, string>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<number, RollEntry[]>>({});
  const [addRoll, setAddRoll] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadExamData().then(setData).catch((err) => toast.error(`Could not load data: ${err.message}`));
  }, [toast]);

  // The semester's subjects decide who has a backlog — the same list the roll sheet uses.
  useEffect(() => {
    if (!data) return;
    loadSubjectList(semester, data).then(({ subjects }) => setLoaded({ semester, subjects }));
  }, [data, semester]);

  const subjects = useMemo(() => (loaded?.semester === semester ? loaded.subjects : null), [loaded, semester]);
  const firstCode = subjects?.find((s) => s.is_theory)?.course_code ?? subjects?.[0]?.course_code;
  const examLine = examLineEdits[semester] ?? admitExamLine(firstCode, semester, year);
  const footerLine = `Admit card distribution — B.Sc. (CSE) ${admitShortSemester(firstCode, semester)} Exam ${year}`.trim();

  const entries = useMemo(() => {
    if (!data || !subjects) return [];
    const auto = buildRollEntries(semester, subjects.filter((s) => s.course_code.trim()), data.students, data.results);
    const extra = (added[semester] ?? []).filter((e) => !auto.some((a) => a.student.id === e.student.id));
    return [...auto, ...extra]
      .filter((e) => !removed[`${semester}|${e.student.id}`])
      .map((e, i) => ({ e, i }))
      .sort((a, b) => ORDER[a.e.group] - ORDER[b.e.group] || a.i - b.i)
      .map(({ e }) => e);
  }, [data, subjects, semester, added, removed]);

  const count = (group: RollEntry['group']) => entries.filter((e) => e.group === group).length;
  const removedHere = Object.keys(removed).filter((k) => removed[k] && k.startsWith(`${semester}|`)).length;

  const addStudent = () => {
    const roll = addRoll.trim();
    const s = data?.students.find((x) => x.ru_id?.trim() === roll || x.college_id?.trim() === roll);
    if (!s) return toast.error(`No student with RU ID or College ID "${roll}".`);
    const key = `${semester}|${s.id}`;
    if (entries.some((e) => e.student.id === s.id)) return toast.info(`${s.name || s.ru_id} is already on the sheet.`);
    if (removed[key]) setRemoved({ ...removed, [key]: false });
    else setAdded({ ...added, [semester]: [...(added[semester] ?? []), { student: s, group: 'backlog', subjects: [] }] });
    setAddRoll('');
  };

  const download = async () => {
    if (entries.length === 0) return toast.error('There is nobody on the sheet.');
    setBusy(true);
    try {
      const { buildAdmitSheetDocx } = await import('../../../../utils/admit-card');
      const blob = await buildAdmitSheetDocx({ degreeLine: degreeLine.trim(), examLine: examLine.trim(), footerLine, rows: entries.map(admitRowFromEntry) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Admit Card Distribution - ${examLine.replace(/[\\/:*?"<>|]/g, '').trim()}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Admit card distribution sheet downloaded — ${entries.length} examinees.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Admit card distribution" description="A sign-off sheet (Word) for handing out admit cards: everyone sitting the semester's final exam." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Semester" className="col-span-2">
            <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n} — {semesterTitle(n)}</option>)}
            </select>
          </Field>
          <Field label="Exam year">
            <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Degree line">
            <input value={degreeLine} onChange={(e) => setDegreeLine(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Exam title (printed on the sheet)" className="col-span-2 sm:col-span-4" hint="Worked out from the semester's course codes; you can change it.">
            <input value={examLine} onChange={(e) => setExamLineEdits({ ...examLineEdits, [semester]: e.target.value })} className={inputClass} />
          </Field>
        </div>

        {!data || !subjects ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading students and results…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="slate">{count('regular')} regular</Badge>
              <Badge tone="amber">{count('readd')} readd</Badge>
              <Badge tone="rose">{count('backlog')} backlog</Badge>
              {removedHere > 0 && (
                <button className="text-xs text-indigo-600 hover:underline" onClick={() => setRemoved(Object.fromEntries(Object.entries(removed).filter(([k]) => !k.startsWith(`${semester}|`))))}>
                  Put back {removedHere} removed
                </button>
              )}
            </div>
            <p className="flex items-start gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Same examinees as the roll sheet: this semester&apos;s Regular and Readd students, plus students from later semesters whose best result in one of its subjects is still F ({subjects.length} subjects{subjects.length ? `: ${subjects.map((s) => s.course_code).join(', ')}` : ''}).
            </p>

            <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {entries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nobody sits the semester {semester} exam.</p>}
              {entries.map((e, i) => (
                <div key={e.student.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 ring-1 ring-slate-200">
                  <div className="min-w-0 text-sm">
                    <span className="mr-2 text-xs text-slate-400">{i + 1}.</span>
                    <span className="font-mono font-semibold text-slate-900">{e.student.ru_id || e.student.college_id}</span>
                    <span className="ml-2 text-slate-700">{e.student.name || '—'}</span>
                    <span className="ml-2 text-xs text-slate-400">{sessionOf(e.student)}{e.group === 'backlog' ? ` · now Sem ${e.student.semester}` : ''}</span>
                    <span className="ml-2"><Badge tone={GROUP_BADGE[e.group].tone}>{GROUP_BADGE[e.group].label}</Badge></span>
                  </div>
                  <Button size="xs" variant="ghost" icon={X} onClick={() => setRemoved({ ...removed, [`${semester}|${e.student.id}`]: true })} aria-label={`Remove ${e.student.ru_id ?? e.student.name}`} />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input value={addRoll} onChange={(e) => setAddRoll(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStudent()} placeholder="Add a student (improvement, etc.) by RU ID or College ID" className={inputClass} />
              <Button variant="secondary" icon={UserPlus} onClick={addStudent}>Add</Button>
            </div>
            <Button className="w-full" icon={FileDown} loading={busy} disabled={entries.length === 0} onClick={download}>
              Download admit card distribution sheet (Word) — {entries.length} examinees
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
