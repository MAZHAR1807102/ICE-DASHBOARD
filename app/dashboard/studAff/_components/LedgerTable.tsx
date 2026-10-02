'use client';

import { totalDue, type Student } from '../../../../utils/types';
import { MIN_ATTENDANCE_PERCENT } from '../../../../utils/eligibility';

function DueCell({ due, rate }: { due: number; rate?: number }) {
  return (
    <td className="px-6 py-4">
      <div className={`font-bold ${due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{due > 0 ? due : '-'}</div>
      {rate !== undefined && <div className="text-[10px] text-slate-400 font-medium mt-0.5">Rate: {rate}</div>}
    </td>
  );
}

export default function LedgerTable({ students, onPayment, onHistory, onDues }: {
  students: Student[];
  onPayment: (s: Student) => void;
  onHistory: (s: Student) => void;
  onDues: (s: Student) => void;
}) {
  if (students.length === 0) {
    return <div className="p-8 text-center text-slate-500">No students found matching your criteria.</div>;
  }

  const actionClass = 'px-3 py-1 rounded text-xs font-bold transition-colors border';

  return (
    <table className="w-full text-left text-sm whitespace-nowrap">
      <thead className="bg-white border-b border-slate-200">
        <tr>
          <th className="px-6 py-4 font-bold text-slate-500">College ID</th>
          <th className="px-6 py-4 font-bold text-slate-500">RU ID</th>
          <th className="px-6 py-4 font-bold text-slate-500">Name</th>
          <th className="px-6 py-4 font-bold text-slate-500 text-center">Att. %</th>
          <th className="px-6 py-4 font-bold text-slate-500">Monthly</th>
          <th className="px-6 py-4 font-bold text-slate-500">Sem.</th>
          <th className="px-6 py-4 font-bold text-slate-500">Exam</th>
          <th className="px-6 py-4 font-bold text-rose-500 bg-rose-50/30">Fine Due</th>
          <th className="px-6 py-4 font-black text-slate-800 bg-slate-50">Total Due</th>
          <th className="px-6 py-4 font-bold text-slate-500 text-center">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {students.map((s) => {
          const due = totalDue(s);
          const attendance = s.attendance_percentage || 0;
          return (
            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">{s.college_id}</td>
              <td className="px-6 py-4 text-slate-500">{s.ru_id || 'N/A'}</td>
              <td className="px-6 py-4 font-medium text-slate-800">{s.name}</td>
              <td className="px-6 py-4 text-center">
                <span className={`px-2 py-1 rounded text-xs font-bold ${attendance < MIN_ATTENDANCE_PERCENT ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {attendance}%
                </span>
              </td>
              <DueCell due={s.monthly_due || 0} rate={s.agreed_monthly_fee || 0} />
              <DueCell due={s.semester_due || 0} rate={s.agreed_semester_fee || 0} />
              <DueCell due={s.exam_due || 0} rate={s.agreed_ru_exam_fee || 0} />
              <td className={`px-6 py-4 font-bold bg-rose-50/30 ${(s.attendance_fine || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {(s.attendance_fine || 0) > 0 ? s.attendance_fine : '-'}
              </td>
              <td className="px-6 py-4 font-black bg-slate-50 text-slate-800">
                {due === 0
                  ? <span className="text-emerald-600 flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>Cleared</span>
                  : <span>৳{due}</span>}
              </td>
              <td className="px-6 py-4 text-center">
                <div className="flex justify-center space-x-2">
                  <button onClick={() => onPayment(s)} className={`${actionClass} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100`}>Payment</button>
                  <button onClick={() => onHistory(s)} className={`${actionClass} bg-white text-slate-600 border-slate-300 hover:bg-slate-100`}>History</button>
                  <button onClick={() => onDues(s)} className={`${actionClass} bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200`}>Edit Dues</button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
