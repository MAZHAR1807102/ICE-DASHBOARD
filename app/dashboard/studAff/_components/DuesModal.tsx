'use client';

import { useState } from 'react';
import Modal from '../../../components/Modal';
import { supabase } from '../../../../utils/supabase';
import type { FeeCategory, Student } from '../../../../utils/types';

// Contract rates (used by mass billing) plus balance corrections that go into the ledger.
export default function DuesModal({ student, onClose, onSaved }: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rates, setRates] = useState({
    monthly: student.agreed_monthly_fee || 0,
    semester: student.agreed_semester_fee || 0,
    ru_exam: student.agreed_ru_exam_fee || 0,
  });
  const [adjustment, setAdjustment] = useState({ category: 'monthly' as FeeCategory, amount: '', reason: '' });
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveRates = async () => {
    const { error } = await supabase
      .from('master_students')
      .update({
        agreed_monthly_fee: rates.monthly,
        agreed_semester_fee: rates.semester,
        agreed_ru_exam_fee: rates.ru_exam,
      })
      .eq('id', student.id);

    if (error) return alert(`Error updating dues: ${error.message}`);
    alert(`Contract Dues successfully set for ${student.name}.`);
    onSaved();
  };

  // Corrections and waivers go into the ledger with a reason; balances are never overwritten.
  const handleAdjust = async () => {
    const amount = Number(adjustment.amount) || 0;
    if (amount === 0) return alert('Enter a non-zero amount. Use a negative number to reduce what is owed.');
    if (!adjustment.reason.trim()) return alert('A reason is required for every correction.');

    setIsSaving(true);
    const { error } = await supabase.rpc('adjust_balance', {
      p_student_id: student.id,
      p_category: adjustment.category,
      p_amount: amount,
      p_reason: adjustment.reason,
    });
    setIsSaving(false);

    if (error) return alert(`Correction not saved: ${error.message}`);
    alert(`Correction recorded for ${student.name}.`);
    onSaved();
  };

  const rateFields: { key: keyof typeof rates; label: string }[] = [
    { key: 'monthly', label: 'Monthly Contract Rate (1 Month)' },
    { key: 'semester', label: 'Semester Contract Rate' },
    { key: 'ru_exam', label: 'RU Exam Contract Rate' },
  ];

  return (
    <Modal title="Set Contract Dues" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Set permanent contract rates for <span className="font-bold">{student.name}</span>. Mass billing will use these rates.
        </p>
        {rateFields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm font-bold text-slate-700 mb-1">{label}</label>
            <input
              type="number"
              min="0"
              value={rates[key]}
              onChange={(e) => setRates({ ...rates, [key]: Number(e.target.value) })}
              className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        ))}
        <button onClick={handleSaveRates} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg transition-colors">
          Save Contract Dues
        </button>

        <div className="border-t border-slate-200 pt-4 mt-6 space-y-3">
          <p className="text-sm font-bold text-slate-800">Correct a Balance</p>
          <p className="text-xs text-slate-500">For waivers or fixing mistakes. Use a negative amount to reduce what is owed. Every correction is kept in the history with its reason.</p>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={adjustment.category}
              onChange={(e) => setAdjustment({ ...adjustment, category: e.target.value as FeeCategory })}
              className="border-slate-300 border rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="monthly">Monthly (owes ৳{student.monthly_due || 0})</option>
              <option value="semester">Semester (owes ৳{student.semester_due || 0})</option>
              <option value="ru_exam">RU Exam (owes ৳{student.exam_due || 0})</option>
              <option value="fine">Fine (owes ৳{student.attendance_fine || 0})</option>
            </select>
            <input
              type="number"
              value={adjustment.amount}
              onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })}
              className="border-slate-300 border rounded-lg p-2 outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="e.g. -1000"
            />
          </div>
          <input
            type="text"
            value={adjustment.reason}
            onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
            className="w-full border-slate-300 border rounded-lg p-2 outline-none focus:ring-2 focus:ring-slate-500"
            placeholder="Reason (required) — e.g. Merit scholarship waiver"
          />
          <button
            onClick={handleAdjust}
            disabled={isSaving}
            className="w-full bg-white border border-slate-400 hover:bg-slate-50 text-slate-800 font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Record Correction'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
