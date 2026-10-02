'use client';

import { useEffect, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, EmptyState, taka } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import type { FinanceTransaction, Student } from '../../../../utils/types';

const CATEGORY_LABEL = { monthly: 'Monthly', semester: 'Semester', ru_exam: 'RU Exam', fine: 'Fine' };

export default function HistoryModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const toast = useToast();
  const [history, setHistory] = useState<FinanceTransaction[] | null>(null);

  useEffect(() => {
    supabase
      .from('finance_transactions')
      .select('id, category, kind, amount, semester, is_opening, receipt_id, note, created_by_name, created_at')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Could not load history: ${error.message}`);
        setHistory((data as FinanceTransaction[]) ?? []);
      });
  }, [student.id, toast]);

  return (
    <Modal title="Payment History" description={`${student.name} · ${student.college_id}`} size="xl" onClose={onClose}>
      {history === null ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading history…</p>
      ) : history.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No transactions yet" />
      ) : (
        <ol className="space-y-2">
          {history.map((t) => {
            const isPayment = t.kind === 'payment';
            const reducesDue = isPayment || Number(t.amount) < 0;
            const kind = t.is_opening ? 'Opening balance' : t.kind === 'charge' ? 'Charge' : isPayment ? 'Payment' : 'Correction';
            const tone = t.is_opening ? 'slate' : t.kind === 'charge' ? 'amber' : isPayment ? 'emerald' : 'violet';
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 ring-1 ring-slate-100">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone}>{kind}</Badge>
                    <span className="text-sm font-medium text-slate-900">{CATEGORY_LABEL[t.category]}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(t.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {t.created_by_name && ` · ${t.created_by_name}`}
                    {t.receipt_id && <> · Receipt <span className="font-mono font-semibold text-slate-700">{t.receipt_id.slice(0, 8).toUpperCase()}</span></>}
                  </p>
                  {t.note && <p className="mt-0.5 text-xs text-slate-500">{t.note}</p>}
                </div>
                <span className={`font-bold tabular-nums ${reducesDue ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {reducesDue ? '−' : '+'}{taka(Math.abs(Number(t.amount)))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
