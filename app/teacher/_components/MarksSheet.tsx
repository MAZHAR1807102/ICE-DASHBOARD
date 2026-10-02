'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { downloadCsv, parseCsv, toCsv } from '../../../utils/csv';
import { ctCount, ctMax } from '../../../utils/ct';
import { Download, Save, Upload } from 'lucide-react';
import { Button } from '../../components/ui';

export type TeacherCourse = {
  id: string;
  semester: number;
  course_code: string;
  course_name: string;
  credit: number;
  student_count: number;
  ct_saved_at: string | null;
};

type RosterRow = { student_id: string; college_id: string; ru_id: string | null; name: string; ct1: number | null; ct2: number | null; ct3: number | null; ct4: number | null };
type Marks = Record<string, string[]>; // student_id -> CT values as typed

const asText = (v: number | null) => (v === null || v === undefined ? '' : String(Number(v)));

export default function MarksSheet({ course, onSaved }: { course: TeacherCourse; onSaved: () => void }) {
  const count = ctCount(course);
  const max = ctMax(course);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [saved, setSaved] = useState<Marks>({});
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.rpc('teacher_roster', { p_course_id: course.id }).then(({ data, error }) => {
      if (error) return setNotice({ tone: 'error', text: error.message });
      const rows = (data ?? []) as RosterRow[];
      const initial = Object.fromEntries(rows.map((r) => [r.student_id, [r.ct1, r.ct2, r.ct3, r.ct4].slice(0, count).map(asText)]));
      setRoster(rows);
      setMarks(initial);
      setSaved(initial);
    });
  }, [course.id, count]);

  const invalid = (value: string) => value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0 || Number(value) > max);
  const dirtyIds = useMemo(
    () => Object.keys(marks).filter((id) => marks[id].some((v, i) => v !== saved[id]?.[i])),
    [marks, saved],
  );
  const hasErrors = Object.values(marks).some((row) => row.some(invalid));
  const complete = Object.values(marks).filter((row) => row.every((v) => v !== '')).length;

  // Warn before leaving with unsaved marks.
  useEffect(() => {
    if (dirtyIds.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyIds.length]);

  const setMark = (studentId: string, index: number, value: string) =>
    setMarks((prev) => ({ ...prev, [studentId]: prev[studentId].map((v, i) => (i === index ? value : v)) }));

  const handleSave = async () => {
    if (hasErrors) return setNotice({ tone: 'error', text: `Fix the highlighted marks first — each CT must be between 0 and ${max}.` });
    if (dirtyIds.length === 0) return setNotice({ tone: 'ok', text: 'Nothing new to save.' });

    setIsSaving(true);
    const payload = dirtyIds.map((id) => {
      const [ct1, ct2, ct3, ct4] = marks[id];
      return { student_id: id, ct1: ct1 ?? '', ct2: ct2 ?? '', ct3: ct3 ?? '', ct4: ct4 ?? '' };
    });
    const { data, error } = await supabase.rpc('save_ct_marks', { p_course_id: course.id, p_marks: payload });
    setIsSaving(false);

    if (error) return setNotice({ tone: 'error', text: `Not saved: ${error.message}` });
    setSaved(marks);
    setNotice({ tone: 'ok', text: `Saved marks for ${data} student${data === 1 ? '' : 's'}.` });
    onSaved();
  };

  const header = ['College ID', 'RU ID', 'Name', ...Array.from({ length: count }, (_, i) => `CT${i + 1}`)];
  const handleDownload = () =>
    roster && downloadCsv(`${course.course_code}_CT_marks.csv`, toCsv(header, roster.map((r) => [r.college_id, r.ru_id ?? '', r.name, ...marks[r.student_id]])));

  // Upload fills the sheet; nothing is saved until "Save marks".
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !roster) return;
    const next = { ...marks };
    let filled = 0;
    parseCsv(await file.text()).slice(1).forEach((cols) => {
      const row = roster.find((r) => r.college_id === cols[0]?.trim());
      if (!row) return;
      next[row.student_id] = Array.from({ length: count }, (_, i) => (cols[3 + i] ?? '').trim());
      filled++;
    });
    setMarks(next);
    setNotice({ tone: 'ok', text: `Filled marks for ${filled} students from the file. Review them, then press "Save marks".` });
  };

  if (!roster) {
    return <div className="p-10 text-center text-slate-500">{notice?.tone === 'error' ? notice.text : 'Loading students…'}</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200">
        <div>
          <p className="text-xs font-bold text-indigo-600">{course.course_code} · Semester {course.semester} · {course.credit} credits</p>
          <h2 className="text-lg font-black text-slate-900">{course.course_name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{count} CTs, each out of {max} · {complete} of {roster.length} students complete</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Download} onClick={handleDownload}>Download sheet</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
            <Upload className="size-4" aria-hidden /> Upload filled sheet
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </div>

      {notice && (
        <div className={`mx-4 mt-4 rounded-lg px-4 py-2.5 text-sm font-medium ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {notice.text}
        </div>
      )}

      <div className="overflow-x-auto p-3 sm:p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-3 font-bold hidden sm:table-cell">College ID</th>
              <th className="py-2 pr-3 font-bold hidden sm:table-cell">RU ID</th>
              <th className="py-2 pr-3 font-bold">Name</th>
              {Array.from({ length: count }, (_, i) => <th key={i} className="py-2 px-1 font-bold text-center">CT {i + 1}<span className="block text-[10px] normal-case font-medium">/ {max}</span></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roster.map((r) => {
              const isDirty = dirtyIds.includes(r.student_id);
              return (
                <tr key={r.student_id} className={isDirty ? 'bg-amber-50/50' : ''}>
                  <td className="py-2 pr-3 font-medium text-slate-900 whitespace-nowrap hidden sm:table-cell">{r.college_id}</td>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap hidden sm:table-cell">{r.ru_id || '—'}</td>
                  <td className="py-2 pr-2 sm:pr-3 text-slate-700 sm:min-w-40">
                    {r.name}
                    <span className="block text-[11px] leading-tight text-slate-400 sm:hidden">ID {r.college_id}</span>
                    <span className="block text-[11px] leading-tight text-slate-400 sm:hidden">RU {r.ru_id || '—'}</span>
                  </td>
                  {marks[r.student_id].map((value, i) => (
                    <td key={i} className="py-1.5 px-0.5 sm:px-1 text-center">
                      <input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setMark(r.student_id, i, e.target.value)}
                        aria-label={`CT ${i + 1} for ${r.name}`}
                        className={`w-12 sm:w-16 rounded-md border px-1 sm:px-2 py-1.5 text-center font-semibold outline-none focus:ring-2 ${invalid(value) ? 'border-rose-400 bg-rose-50 text-rose-700 focus:ring-rose-400' : 'border-slate-300 text-slate-900 focus:ring-indigo-500'}`}
                        placeholder="–"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {roster.length === 0 && <tr><td colSpan={3 + count} className="py-10 text-center text-slate-500">No students are enrolled in semester {course.semester} yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {dirtyIds.length > 0 ? <><b className="text-amber-700">{dirtyIds.length} unsaved</b> change{dirtyIds.length === 1 ? '' : 's'} · </> : 'All changes saved · '}
          Leave a box empty if that CT hasn&apos;t been held yet.
        </p>
        <Button icon={Save} loading={isSaving} disabled={dirtyIds.length === 0} onClick={handleSave}>Save marks</Button>
      </div>
    </div>
  );
}
