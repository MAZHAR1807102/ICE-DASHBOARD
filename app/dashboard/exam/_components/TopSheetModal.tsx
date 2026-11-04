'use client';

import { useEffect, useState } from 'react';
import { FileDown, Plus, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, cx, inputClass } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { semesterTitle } from '../../../../utils/rollsheet';
import { SEMESTERS, type Course } from '../../../../utils/types';
import { KIND_TITLE, codeKind, codeSemester, examTitle, type TopSheetPage } from '../../../../utils/top-sheet';

type PageLine = { key: number; semester: number; kind: 'lab' | 'ca'; codes: string };
const codesOf = (text: string) => text.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);

// Exams → Documents → Top sheet: the cover page for each bundle of mark sheets sent to RU — Lab Mark
// and/or CA — upper copy to the exam Chairman, lower copy to the Exam Controller.
export default function TopSheetModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [semester, setSemester] = useState(1);
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [chairman, setChairman] = useState('');
  const [fromText, setFromText] = useState('Imperial College of Engineering, Khulna\nKhulna-9000');
  const [controllerText, setControllerText] = useState('Exam Controller\nUniversity of Rajshahi\nRajshahi-6205');
  const [pages, setPages] = useState<PageLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('courses').select('*').order('course_code').then(({ data, error }) => {
      if (error) return toast.error(`Could not load courses: ${error.message}`);
      setCourses((data ?? []) as Course[]);
    });
  }, [toast]);

  // Course codes of a semester's bundle, from Curriculum (by the code's year/semester digits).
  const codesFor = (sem: number, kind: 'lab' | 'ca') => [...new Set(courses
    .map((c) => c.course_code.toUpperCase().replace(/\s+/g, ''))
    .filter((c) => codeSemester(c) === sem && codeKind(c) === kind))].sort();
  const addPages = (sem: number, kinds: ('lab' | 'ca')[]) => setPages((list) => {
    let key = Math.max(0, ...list.map((p) => p.key)) + 1;
    return [...list, ...kinds.map((kind) => ({ key: key++, semester: sem, kind, codes: codesFor(sem, kind).join(', ') }))];
  });
  const setPage = (key: number, patch: Partial<PageLine>) => setPages((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const download = async () => {
    const list: TopSheetPage[] = pages.map((p) => ({ semester: p.semester, kind: p.kind, codes: codesOf(p.codes) })).filter((p) => p.codes.length);
    if (!list.length) return toast.error('Add at least one page with course codes.');
    if (!chairman.trim()) return toast.error('Enter the exam Chairman’s name.');
    setBusy(true);
    try {
      const { buildTopSheetDocx } = await import('../../../../utils/top-sheet');
      const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
      const blob = await buildTopSheetDocx({
        examYear, department: 'Computer Science and Engineering', chairman: chairman.trim(),
        from: lines(fromText), controller: lines(controllerText), pages: list,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sems = [...new Set(list.map((p) => p.semester))];
      a.download = `Top sheet - ${sems.length === 1 ? semesterTitle(sems[0]) : 'Exam'} ${examYear}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Top sheet downloaded — ${list.length} page${list.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(`Could not create the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const small = cx(inputClass, 'h-9 text-sm');

  return (
    <Modal title="Top sheet" description="Cover pages for the mark-sheet bundles sent to RU: upper copy to the exam Chairman, lower copy to the Exam Controller." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Exam year">
            <input value={examYear} onChange={(e) => setExamYear(e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Exam Chairman" className="col-span-2 sm:col-span-3">
            <input value={chairman} onChange={(e) => setChairman(e.target.value)} placeholder="e.g. Dr. MD. Anisuzzaman Siddique" className={inputClass} />
          </Field>
        </div>

        <section className="rounded-xl ring-1 ring-slate-200">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">Pages</p>
              <p className="text-xs text-slate-500">One page per bundle. Codes come from Curriculum — edit them freely (comma or space separated).</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={small} aria-label="Semester to add">
                  {SEMESTERS.map((n) => <option key={n} value={n}>{n} · {semesterTitle(n)}</option>)}
                </select>
              </div>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => addPages(semester, ['lab', 'ca'])}>Lab + CA</Button>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => addPages(semester, ['lab'])}>Lab only</Button>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => addPages(semester, ['ca'])}>CA only</Button>
            </div>
          </div>
          {pages.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Choose a semester and add its Lab and/or CA page.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pages.map((p, i) => (
                <li key={p.key} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Page {i + 1} · {KIND_TITLE[p.kind]} · <span className="font-normal text-slate-600">{examTitle(p.semester, examYear)}</span>
                    </p>
                    <Button size="xs" variant="ghost" icon={Trash2} onClick={() => setPages((list) => list.filter((x) => x.key !== p.key))} aria-label={`Remove page ${i + 1}`} className="hover:bg-rose-50 hover:text-rose-600" />
                  </div>
                  <input value={p.codes} onChange={(e) => setPage(p.key, { codes: e.target.value })} placeholder="CSE3222, CSE3232" className={cx(small, 'font-mono')} aria-label={`Course codes for page ${i + 1}`} />
                  {codesOf(p.codes).length === 0 && <p className="text-xs text-amber-700">No course codes — add them, or this page is left out.</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From (both copies)" hint="One line per row, printed after “From,”.">
            <textarea rows={3} value={fromText} onChange={(e) => setFromText(e.target.value)} className={inputClass} />
          </Field>
          <Field label="To — lower copy" hint="The upper copy goes to the Chairman of that exam.">
            <textarea rows={3} value={controllerText} onChange={(e) => setControllerText(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Upper copy: “To, {chairman.trim() || 'the Chairman'}, Chairman, [exam], Department of Computer Science and Engineering, University of Rajshahi, Rajshahi-6205”.</p>
          <Button icon={FileDown} loading={busy} disabled={!pages.length} onClick={download}>Download top sheet (Word)</Button>
        </div>
      </div>
    </Modal>
  );
}
