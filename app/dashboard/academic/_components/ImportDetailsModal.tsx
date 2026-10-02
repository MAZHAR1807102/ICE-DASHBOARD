'use client';

import { useState } from 'react';
import { AlertTriangle, FileUp, Save } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, cx, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { readRollSheetFile, type SheetDetails } from '../../../../utils/rollsheet-import';
import { sessionOf } from '../../../../utils/rollsheet';
import type { Student } from '../../../../utils/types';

type Field = 'name_bn' | 'mother_name' | 'father_name' | 'session';
const FIELDS: { key: Field; label: string }[] = [
  { key: 'name_bn', label: 'Bangla name' },
  { key: 'mother_name', label: "Mother's name" },
  { key: 'father_name', label: "Father's name" },
  { key: 'session', label: 'Session' },
];
type Plan = { student: Student; sheet: SheetDetails; fill: Partial<Record<Field, string>>; differs: Partial<Record<Field, string>>; nameDiffers: boolean };

const same = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// Academic → Import details: fill Bangla names, parents' names and sessions from an existing roll sheet.
export default function ImportDetailsModal({ students, onClose, onSaved }: { students: Student[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const toast = useToast();
  const [fileName, setFileName] = useState('');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [notFound, setNotFound] = useState<SheetDetails[]>([]);
  const [legacy, setLegacy] = useState(0);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());
  const [rename, setRename] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const rows = await readRollSheetFile(file);
      if (rows.length === 0) throw new Error('No students (10-digit roll + session) were found in this file.');
      const byRoll = new Map(students.filter((s) => s.ru_id).map((s) => [s.ru_id!.trim(), s]));
      const next: Plan[] = [];
      const missing: SheetDetails[] = [];
      rows.forEach((sheet) => {
        const student = byRoll.get(sheet.roll);
        if (!student) return missing.push(sheet);
        const fill: Plan['fill'] = {}, differs: Plan['differs'] = {};
        FIELDS.forEach(({ key }) => {
          const value = sheet[key];
          if (!value) return;
          // Session only matters when it isn't what the RU ID already implies.
          const current = key === 'session' ? (student.session ?? '') : (student[key] ?? '');
          if (key === 'session' && !current && value === sessionOf({ ru_id: student.ru_id })) return;
          if (!current.trim()) fill[key] = value;
          else if (!same(current, value)) differs[key] = value;
        });
        next.push({ student, sheet, fill, differs, nameDiffers: !!sheet.name && !same(sheet.name, student.name) });
      });
      setPlans(next.filter((p) => Object.keys(p.fill).length || Object.keys(p.differs).length || p.nameDiffers));
      setNotFound(missing);
      setLegacy(rows.filter((r) => r.legacyBangla).length);
      setOverwrite(new Set());
      setRename(new Set());
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const updates = (plans ?? []).map((p) => {
    const patch: Record<string, string> = { ...p.fill };
    if (overwrite.has(p.student.id)) Object.assign(patch, p.differs);
    if (rename.has(p.student.id) && p.sheet.name) patch.name = p.sheet.name;
    return { id: p.student.id, patch };
  }).filter((u) => Object.keys(u.patch).length);

  const apply = async () => {
    setBusy(true);
    const failures: string[] = [];
    for (const u of updates) {
      const { error } = await supabase.from('master_students').update(u.patch).eq('id', u.id);
      if (error) failures.push(error.message);
    }
    setBusy(false);
    if (failures.length) return toast.error(`${failures.length} students not updated: ${failures[0]}`);
    onSaved(`Details updated for ${updates.length} students from ${fileName}.`);
  };

  return (
    <Modal title="Import details from a roll sheet" description="Fill in Bangla names, parents' names and sessions from an RU roll sheet you already have (.docx)." size="xl" onClose={onClose}>
      <div className="space-y-4">
        <label className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-6 py-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40', busy && 'pointer-events-none opacity-60')}>
          <FileUp className="size-7 text-indigo-500" aria-hidden />
          <span className="font-semibold text-slate-900">{fileName ? `Read: ${fileName} — choose another` : 'Choose a roll sheet (.docx)'}</span>
          <span className="text-xs text-slate-500">Old .doc files: open in Word → Save As → Word Document (.docx)</span>
          <input type="file" accept=".docx,.doc" className="hidden" onChange={handleFile} />
        </label>
        {error && <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</p>}

        {plans && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="emerald">{plans.filter((p) => Object.keys(p.fill).length).length} students get missing details filled</Badge>
              <Badge tone="amber">{plans.filter((p) => Object.keys(p.differs).length || p.nameDiffers).length} with differences to review</Badge>
              {notFound.length > 0 && <Badge tone="slate">{notFound.length} rolls not in the system</Badge>}
              {legacy > 0 && <Badge tone="slate">{legacy} Bangla names in the old Bijoy font — skipped</Badge>}
            </div>
            {plans.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Everything on this sheet already matches the system.</p>
            ) : (
              <div className={`${table.wrap} max-h-[45vh] overflow-y-auto rounded-xl ring-1 ring-slate-200`}>
                <table className={table.table}>
                  <thead className={`${table.head} sticky top-0`}>
                    <tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Will be filled in</th><th className="px-3 py-2">Different on the sheet</th></tr>
                  </thead>
                  <tbody className={table.body}>
                    {plans.map((p) => (
                      <tr key={p.student.id} className="align-top">
                        <td className="px-3 py-2">
                          <p className="font-mono text-xs text-slate-500">{p.sheet.roll}</p>
                          <p className="font-medium text-slate-900">{p.student.name || '—'}</p>
                          {p.nameDiffers && (
                            <label className="mt-1 flex items-start gap-1.5 text-xs text-amber-800">
                              <input type="checkbox" checked={rename.has(p.student.id)} onChange={() => toggle(rename, setRename, p.student.id)} className="mt-0.5 size-3.5" />
                              Use RU spelling: <b>{p.sheet.name}</b>
                            </label>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-700">
                          {Object.entries(p.fill).map(([k, v]) => <p key={k}><span className="text-slate-400">{FIELDS.find((f) => f.key === k)?.label}:</span> {v}</p>)}
                          {!Object.keys(p.fill).length && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {Object.entries(p.differs).map(([k, v]) => (
                            <p key={k} className="text-slate-700"><span className="text-slate-400">{FIELDS.find((f) => f.key === k)?.label}:</span> {String(p.student[k as Field] ?? '')} → <b>{v}</b></p>
                          ))}
                          {Object.keys(p.differs).length > 0 && (
                            <label className="mt-1 flex items-center gap-1.5 text-amber-800">
                              <input type="checkbox" checked={overwrite.has(p.student.id)} onChange={() => toggle(overwrite, setOverwrite, p.student.id)} className="size-3.5" />
                              Replace with the sheet&apos;s
                            </label>
                          )}
                          {!Object.keys(p.differs).length && <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {notFound.length > 0 && <p className="text-xs text-slate-500">Not in the system: {notFound.map((n) => n.roll).join(', ')}</p>}
            <Button icon={Save} loading={busy} disabled={updates.length === 0} onClick={apply} className="w-full">
              Update {updates.length} students
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
