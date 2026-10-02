'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, History, Save, Trash2, Upload } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, EmptyState, table } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { downloadCsv, toCsv } from '../../../../utils/csv';
import { loadSpreadsheet } from '../../../../utils/result-sheet-loader';
import type { AcademicOpening, Student } from '../../../../utils/types';

type Roster = Pick<Student, 'id' | 'college_id' | 'ru_id' | 'name' | 'semester'>[];
type Row = { student_id: string; through_semester: number; credits: number; cgpa: number };

const HEADER = ['College ID', 'RU ID', 'Name', 'Current semester', 'Through semester', 'Credits completed', 'CGPA'];

// Starting CGPA for semesters that were never uploaded: "through semester N, X credits, CGPA Y".
export default function StartingCgpaModal({ students, onClose, onSaved }: { students: Roster; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [openings, setOpenings] = useState<AcademicOpening[] | null>(null);
  const [preview, setPreview] = useState<{ rows: Row[]; problems: string[] } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = () => supabase.from('academic_opening').select('*').then(({ data }) => setOpenings((data ?? []) as AcademicOpening[]));
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const handleTemplate = () => {
    const current = new Map((openings ?? []).map((o) => [o.student_id, o]));
    const rows = [...students]
      .filter((s) => s.semester > 1)
      .sort((a, b) => a.semester - b.semester || a.college_id.localeCompare(b.college_id))
      .map((s) => {
        const o = current.get(s.id);
        return [s.college_id, s.ru_id ?? '', s.name, s.semester, o?.through_semester ?? '', o ? Number(o.credits) : '', o ? Number(o.cgpa) : ''];
      });
    downloadCsv('Starting_CGPA.csv', toCsv(HEADER, rows));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const grid = await loadSpreadsheet(file);
    const rows: Row[] = [];
    const problems: string[] = [];
    grid.slice(1).forEach((cols, i) => {
      const [collegeId, ruId, , , through, credits, cgpa] = cols;
      if (!through && !credits && !cgpa) return; // left blank = no starting point for this student
      const student = students.find((s) => (collegeId && s.college_id === collegeId) || (ruId && s.ru_id === ruId));
      const line = `Line ${i + 2}`;
      if (!student) return problems.push(`${line}: no student with College ID "${collegeId}" / RU ID "${ruId}"`);
      const row = { student_id: student.id, through_semester: Number(through), credits: Number(credits), cgpa: Number(cgpa) };
      if (!(row.through_semester >= 1 && row.through_semester <= 8)) return problems.push(`${line} (${student.name}): "Through semester" must be 1–8`);
      if (!(row.credits > 0)) return problems.push(`${line} (${student.name}): credits completed must be more than 0`);
      if (!(row.cgpa >= 0 && row.cgpa <= 4)) return problems.push(`${line} (${student.name}): CGPA must be between 0 and 4`);
      if (row.through_semester >= student.semester) problems.push(`${line} (${student.name}): through semester ${row.through_semester} but they are in semester ${student.semester} — saved anyway, please double-check`);
      rows.push(row);
    });
    setPreview({ rows, problems });
  };

  const handleSave = async () => {
    if (!preview?.rows.length) return;
    setIsSaving(true);
    const { error } = await supabase.from('academic_opening').upsert(preview.rows, { onConflict: 'student_id' });
    setIsSaving(false);
    if (error) return toast.error(`Not saved: ${error.message}`);
    toast.success(`Starting CGPA saved for ${preview.rows.length} students. Their CGPA has been recalculated.`);
    setPreview(null);
    load();
    onSaved();
  };

  const handleRemove = async (o: AcademicOpening) => {
    const s = byId.get(o.student_id);
    if (!(await confirm({ title: `Remove the starting CGPA for ${s?.name ?? 'this student'}?`, body: 'Their CGPA will be calculated from uploaded results only.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    const { error } = await supabase.from('academic_opening').delete().eq('student_id', o.student_id);
    if (error) return toast.error(error.message);
    load();
    onSaved();
  };

  return (
    <Modal title="Earlier results (starting CGPA)" description="For semesters that were published before this system and haven't been uploaded." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
          <p>From each student&apos;s last RU result, enter <b>through which semester</b> it covers, the <b>credits completed</b> and the <b>CGPA</b>. Results you upload for later semesters are added on top, and the CGPA keeps running from there.</p>
          <p className="mt-2 text-xs text-slate-500">If you also upload the RU sheets for those early semesters, the starting CGPA is used instead of them — so use one or the other for each semester.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" icon={Download} onClick={handleTemplate}>Download sheet (students in semester 2+)</Button>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
            <Upload className="size-4" aria-hidden /> Upload filled sheet
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          </label>
        </div>

        {preview && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700"><b>{preview.rows.length}</b> students ready{preview.problems.length ? ` · ${preview.problems.length} to check` : ''}.</p>
            {preview.problems.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                {preview.problems.map((p) => <p key={p} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />{p}</p>)}
              </div>
            )}
            <Button icon={Save} loading={isSaving} disabled={!preview.rows.length} onClick={handleSave} className="w-full">Save starting CGPA for {preview.rows.length} students</Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Saved starting points {openings ? `(${openings.length})` : ''}</p>
          {openings && openings.length === 0 ? (
            <EmptyState icon={History} title="None yet" body="Students' CGPA is calculated from uploaded results only." />
          ) : (
            <div className={`${table.wrap} max-h-72 overflow-y-auto rounded-xl ring-1 ring-slate-200`}>
              <table className={table.table}>
                <thead className={`${table.head} sticky top-0`}>
                  <tr><th className={table.th}>Student</th><th className={`${table.th} text-center`}>Through</th><th className={`${table.th} text-center`}>Credits</th><th className={`${table.th} text-center`}>CGPA</th><th className={table.th} /></tr>
                </thead>
                <tbody className={table.body}>
                  {(openings ?? []).map((o) => {
                    const s = byId.get(o.student_id);
                    return (
                      <tr key={o.student_id} className={table.row}>
                        <td className="px-4 py-2"><p className="font-medium text-slate-900">{s?.name || '—'}</p><p className="text-xs text-slate-500">{s?.college_id} · RU {s?.ru_id ?? '—'}</p></td>
                        <td className="px-4 py-2 text-center"><Badge>Sem 1–{o.through_semester}</Badge></td>
                        <td className="px-4 py-2 text-center tabular-nums">{Number(o.credits)}</td>
                        <td className="px-4 py-2 text-center font-semibold tabular-nums">{Number(o.cgpa).toFixed(3)}</td>
                        <td className="px-4 py-2 text-right"><Button size="xs" variant="ghost" icon={Trash2} onClick={() => handleRemove(o)} aria-label="Remove" className="text-slate-400 hover:bg-rose-50 hover:text-rose-600" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
