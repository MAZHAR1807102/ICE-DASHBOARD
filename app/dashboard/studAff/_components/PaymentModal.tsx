'use client';

import { useState } from 'react';
import Modal from '../../../components/Modal';
import { supabase } from '../../../../utils/supabase';
import { totalDue, type Student } from '../../../../utils/types';

type Amounts = { monthly: string; semester: string; ru_exam: string; fine: string };

export default function PaymentModal({ student, onClose, onSaved }: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amounts, setAmounts] = useState<Amounts>({ monthly: '', semester: '', ru_exam: '', fine: '' });
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fields: { key: keyof Amounts; label: string; due: number; fine?: boolean }[] = [
    { key: 'monthly', label: 'Monthly', due: student.monthly_due || 0 },
    { key: 'semester', label: 'Semester', due: student.semester_due || 0 },
    { key: 'ru_exam', label: 'RU Exam', due: student.exam_due || 0 },
    { key: 'fine', label: 'Fine', due: student.attendance_fine || 0, fine: true },
  ];

  const handleSave = async () => {
    const value = (key: keyof Amounts) => Number(amounts[key]) || 0;
    const total = value('monthly') + value('semester') + value('ru_exam') + value('fine');
    if (total === 0) return alert('Please enter at least one valid payment amount.');

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

    if (error) return alert(`Payment not saved: ${error.message}`);
    alert(`Payment of ৳${total} recorded for ${student.name}.\nReceipt: ${String(receiptId).slice(0, 8).toUpperCase()}`);
    onSaved();
  };

  return (
    <Modal title="Receive Payments" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-blue-50 p-3 rounded-lg text-sm border border-blue-100">
          Recording payment for <span className="font-bold text-blue-900">{student.name}</span>.<br />
          Current total due: <span className="font-bold text-rose-600">৳{totalDue(student)}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {fields.map(({ key, label, due, fine }) => (
            <div key={key}>
              <label className={`block text-xs font-bold mb-1 ${fine ? 'text-rose-600' : 'text-slate-700'}`}>{label} (Due: ৳{due})</label>
              <input
                type="number"
                min="0"
                value={amounts[key]}
                onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })}
                className={`w-full border rounded-lg p-2 outline-none focus:ring-2 ${fine ? 'border-rose-300 bg-rose-50 focus:ring-rose-500' : 'border-slate-300 focus:ring-emerald-500'}`}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border-slate-300 border rounded-lg p-2 outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="e.g. Cash, bKash TrxID…"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Confirm & Save Receipts'}
        </button>
      </div>
    </Modal>
  );
}
