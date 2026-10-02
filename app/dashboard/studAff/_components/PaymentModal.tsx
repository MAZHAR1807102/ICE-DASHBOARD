'use client';

import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, inputClass, taka } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { totalDue, type Student } from '../../../../utils/types';

type Amounts = { monthly: string; semester: string; ru_exam: string; fine: string };

export default function PaymentModal({ student, onClose, onSaved }: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [amounts, setAmounts] = useState<Amounts>({ monthly: '', semester: '', ru_exam: '', fine: '' });
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fields: { key: keyof Amounts; label: string; due: number }[] = [
    { key: 'monthly', label: 'Monthly fee', due: student.monthly_due || 0 },
    { key: 'semester', label: 'Semester fee', due: student.semester_due || 0 },
    { key: 'ru_exam', label: 'RU exam fee', due: student.exam_due || 0 },
    { key: 'fine', label: 'Attendance fine', due: student.attendance_fine || 0 },
  ];
  const value = (key: keyof Amounts) => Number(amounts[key]) || 0;
  const total = value('monthly') + value('semester') + value('ru_exam') + value('fine');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (total === 0) return toast.info('Enter at least one amount.');

    // All lines are saved together as one receipt, or none are (e.g. if one is more than owed).
    setIsSaving(true);
    const { data: receiptId, error } = await supabase.rpc('record_payment', {
      p_student_id: student.id,
      p_monthly: value('monthly'),
      p_semester: value('semester'),
      p_ru_exam: value('ru_exam'),
      p_fine: value('fine'),
      p_note: note,
    });
    setIsSaving(false);

    if (error) return toast.error(`Payment not saved: ${error.message}`);
    toast.success(`${taka(total)} received from ${student.name}.\nReceipt ${String(receiptId).slice(0, 8).toUpperCase()}`);
    onSaved();
  };

  return (
    <Modal title="Receive payment" description={`${student.name} · owes ${taka(totalDue(student))} in total`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, due }) => (
            <Field key={key} label={label} hint={due > 0 ? `Owes ${taka(due)}` : 'Nothing owed'}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">৳</span>
                <input
                  type="number" min="0" inputMode="decimal" disabled={due <= 0}
                  value={amounts[key]}
                  onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })}
                  className={`${inputClass} pl-7`} placeholder="0"
                />
              </div>
            </Field>
          ))}
        </div>
        <Field label="Note (optional)">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. Cash, bKash TrxID…" />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">Total received</span>
          <span className="text-lg font-bold tabular-nums text-slate-900">{taka(total)}</span>
        </div>
        <Button type="submit" variant="success" icon={HandCoins} loading={isSaving} disabled={total === 0} className="w-full">
          Save payment & issue receipt
        </Button>
      </form>
    </Modal>
  );
}
