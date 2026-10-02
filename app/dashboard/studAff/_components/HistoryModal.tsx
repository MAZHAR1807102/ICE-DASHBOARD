'use client';

import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import { supabase } from '../../../../utils/supabase';
import type { FinanceTransaction, Student } from '../../../../utils/types';

const CATEGORY_LABEL = { monthly: 'Monthly', semester: 'Semester', ru_exam: 'RU Exam', fine: 'Fine' };

export default function HistoryModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const [history, setHistory] = useState<FinanceTransaction[] | null>(null);

  useEffect(() => {
    supabase
      .from('finance_transactions')
      .select('id, category, kind, amount, semester, is_opening, receipt_id, note, created_by_name, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) alert(`Could not load history: ${error.message}`);
        setHistory((data as FinanceTransaction[]) ?? []);
      });
  }, [student.id]);

  return (
    <Modal title={`Payment History — ${student.name}`} size="xl" onClose={onClose}>
      <div className="max-h-[60vh] overflow-y-auto">
        {history === null ? (
          <p className="text-center text-slate-500 py-8">Loading history...</p>
        ) : history.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No transactions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Details</th>
                <th className="py-2">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((t) => {
                const isPayment = t.kind === 'payment';
                const reducesDue = isPayment || Number(t.amount) < 0;
                const kindLabel = t.is_opening ? 'Opening balance' : t.kind === 'charge' ? 'Charge' : isPayment ? 'Payment' : 'Correction';
                return (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="font-bold text-slate-800">{CATEGORY_LABEL[t.category]}</span>
                      <span className="text-slate-500"> · {kindLabel}</span>
                    </td>
                    <td className={`py-2 pr-3 text-right font-bold whitespace-nowrap ${reducesDue ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {reducesDue ? '−' : '+'}৳{Math.abs(Number(t.amount)).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {t.note}
                      {t.receipt_id && <span className="text-xs text-slate-400"> (Receipt {t.receipt_id.slice(0, 8).toUpperCase()})</span>}
                    </td>
                    <td className="py-2 text-slate-500 whitespace-nowrap">{t.created_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
