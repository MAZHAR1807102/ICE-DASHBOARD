'use client';

import { useState } from 'react';
import { Save, Scale } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, inputClass, taka } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import type { FeeCategory, Student } from '../../../../utils/types';

// Contract rates (used by mass billing) plus balance corrections that go into the ledger.
export default function DuesModal({ student, onClose, onSaved }: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [rates, setRates] = useState({
    monthly: student.agreed_monthly_fee || 0,
    semester: student.agreed_semester_fee || 0,
    ru_exam: student.agreed_ru_exam_fee || 0,
  });
  const [adjustment, setAdjustment] = useState({ category: 'monthly' as FeeCategory, amount: '', reason: '' });
  const [saving, setSaving] = useState<'rates' | 'adjust' | null>(null);

  const handleSaveRates = async () => {
    setSaving('rates');
    const { error } = await supabase
      .from('master_students')
      .update({ agreed_monthly_fee: rates.monthly, agreed_semester_fee: rates.semester, agreed_ru_exam_fee: rates.ru_exam })
      .eq('id', student.id);
    setSaving(null);
    if (error) return toast.error(`Rates not saved: ${error.message}`);
    toast.success(`Contract rates saved for ${student.name}.`);
    onSaved();
  };

  // Corrections and waivers go into the ledger with a reason; balances are never overwritten.
  const handleAdjust = async () => {
    const amount = Number(adjustment.amount) || 0;
    if (amount === 0) return toast.info('Enter a non-zero amount. Use a negative number to reduce what is owed.');
    if (!adjustment.reason.trim()) return toast.info('A reason is required for every correction.');

    setSaving('adjust');
    const { error } = await supabase.rpc('adjust_balance', {
      p_student_id: student.id,
      p_category: adjustment.category,
      p_amount: amount,
      p_reason: adjustment.reason,
    });
    setSaving(null);
    if (error) return toast.error(`Correction not saved: ${error.message}`);
    toast.success(`Correction recorded for ${student.name}.`);
    onSaved();
  };

  const rateFields: { key: keyof typeof rates; label: string }[] = [
    { key: 'monthly', label: 'Monthly (per month)' },
    { key: 'semester', label: 'Semester' },
    { key: 'ru_exam', label: 'RU exam' },
  ];

  return (
    <Modal title="Edit dues" description={student.name} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h4 className="text-sm font-semibold text-slate-900">Contract rates</h4>
          <p className="mb-3 text-xs text-slate-500">Mass billing charges these amounts.</p>
          <div className="grid grid-cols-3 gap-3">
            {rateFields.map(({ key, label }) => (
              <Field key={key} label={label}>
                <input type="number" min="0" value={rates[key]} onChange={(e) => setRates({ ...rates, [key]: Number(e.target.value) })} className={inputClass} />
              </Field>
            ))}
          </div>
          <Button variant="dark" icon={Save} loading={saving === 'rates'} onClick={handleSaveRates} className="mt-3 w-full">Save rates</Button>
        </section>

        <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <h4 className="text-sm font-semibold text-slate-900">Correct a Balance</h4>
          <p className="mb-3 text-xs text-slate-500">For waivers or fixing mistakes. A negative amount reduces what is owed. Every correction stays in the history with its reason.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fee">
              <select value={adjustment.category} onChange={(e) => setAdjustment({ ...adjustment, category: e.target.value as FeeCategory })} className={inputClass}>
                <option value="monthly">Monthly — owes {taka(student.monthly_due || 0)}</option>
                <option value="semester">Semester — owes {taka(student.semester_due || 0)}</option>
                <option value="ru_exam">RU Exam — owes {taka(student.exam_due || 0)}</option>
                <option value="fine">Fine — owes {taka(student.attendance_fine || 0)}</option>
              </select>
            </Field>
            <Field label="Amount">
              <input type="number" value={adjustment.amount} onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })} className={inputClass} placeholder="e.g. -1000" />
            </Field>
            <Field label="Reason" className="sm:col-span-2">
              <input type="text" value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} className={inputClass} placeholder="e.g. Merit scholarship waiver" />
            </Field>
          </div>
          <Button variant="secondary" icon={Scale} loading={saving === 'adjust'} onClick={handleAdjust} className="mt-3 w-full">Record correction</Button>
        </section>
      </div>
    </Modal>
  );
}
