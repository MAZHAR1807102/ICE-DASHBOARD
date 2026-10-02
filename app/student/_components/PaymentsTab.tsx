import { totalDue, type FinanceTransaction, type Student } from '../../../utils/types';
import { ReceiptText } from 'lucide-react';
import { Card, EmptyState, formatDate, taka } from './ui';

const CATEGORY = { monthly: 'Monthly fee', semester: 'Semester fee', ru_exam: 'RU exam fee', fine: 'Attendance fine' };

export default function PaymentsTab({ student, transactions }: { student: Student; transactions: FinanceTransaction[] }) {
  const balances = [
    { label: 'Monthly fee', due: student.monthly_due || 0 },
    { label: 'Semester fee', due: student.semester_due || 0 },
    { label: 'RU exam fee', due: student.exam_due || 0 },
    { label: 'Attendance fine', due: student.attendance_fine || 0 },
  ];
  const outstanding = totalDue(student);
  const paid = transactions.filter((t) => t.kind === 'payment').reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={outstanding > 0 ? 'ring-1 ring-rose-100' : 'ring-1 ring-emerald-100'}>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Outstanding</p>
          <p className={`text-3xl font-black mt-1 ${outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{taka(outstanding)}</p>
          <p className="text-xs text-slate-500 mt-1">{outstanding > 0 ? 'Please clear this at the finance office.' : 'You are fully paid up. ✓'}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Paid so far</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{taka(paid)}</p>
          <p className="text-xs text-slate-500 mt-1">Recorded since the new ledger started</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Breakdown</p>
          <ul className="space-y-1.5 text-sm">
            {balances.map((b) => (
              <li key={b.label} className="flex justify-between">
                <span className="text-slate-600">{b.label}</span>
                <span className={`font-bold ${b.due > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{taka(b.due)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Payment history">
        {transactions.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No transactions yet" body="Bills, payments and receipts will be listed here." />
        ) : (
          <ol className="relative border-l border-slate-200 ml-2 space-y-5">
            {transactions.map((t) => {
              const isPayment = t.kind === 'payment';
              const reduces = isPayment || Number(t.amount) < 0;
              const label = t.is_opening ? 'Opening balance' : t.kind === 'charge' ? 'Charged' : isPayment ? 'Payment received' : 'Correction';
              return (
                <li key={t.id} className="ml-5">
                  <span className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-white ${reduces ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{label} · <span className="font-medium text-slate-600">{CATEGORY[t.category]}</span></p>
                      <p className="text-xs text-slate-500">
                        {formatDate(t.created_at)}
                        {t.receipt_id && <> · Receipt <span className="font-mono font-bold text-slate-700">{t.receipt_id.slice(0, 8).toUpperCase()}</span></>}
                      </p>
                      {t.note && <p className="text-xs text-slate-500 mt-0.5">{t.note}</p>}
                    </div>
                    <p className={`font-black tabular-nums ${reduces ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {reduces ? '−' : '+'}{taka(Math.abs(Number(t.amount)))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
