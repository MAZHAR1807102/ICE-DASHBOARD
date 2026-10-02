'use client';

import { History, HandCoins, Search, SlidersHorizontal } from 'lucide-react';
import { totalDue, type Student } from '../../../../utils/types';
import { MIN_ATTENDANCE_PERCENT } from '../../../../utils/eligibility';
import { Fragment } from 'react';
import { Badge, Button, EmptyState, GroupHeading, ReaddBadge, table, taka } from '../../../components/ui';
import { groupHeadings, type Cohort } from '../../../../utils/cohort';

function Due({ due, rate }: { due: number; rate?: number }) {
  return (
    <td className={`${table.td} text-right tabular-nums`}>
      <span className={due > 0 ? 'font-semibold text-slate-900' : 'text-slate-300'}>{due > 0 ? taka(due) : '—'}</span>
      {rate !== undefined && <span className="block text-[11px] text-slate-400">rate {taka(rate)}</span>}
    </td>
  );
}

export default function LedgerTable({ students, cohorts, showSemester, onPayment, onHistory, onDues }: {
  students: Student[]; // already ordered Regular → Readd
  cohorts: Map<string, Cohort>;
  showSemester: boolean;
  onPayment: (s: Student) => void;
  onHistory: (s: Student) => void;
  onDues: (s: Student) => void;
}) {
  const headings = groupHeadings(students, cohorts, showSemester);
  if (students.length === 0) return <EmptyState icon={Search} title="No students found" body="Try a different name, ID or semester." />;

  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead className={table.head}>
          <tr>
            <th className={table.th}>Student</th>
            <th className={`${table.th} text-center`}>Attendance</th>
            <th className={`${table.th} text-right`}>Monthly</th>
            <th className={`${table.th} text-right`}>Semester</th>
            <th className={`${table.th} text-right`}>RU Exam</th>
            <th className={`${table.th} text-right`}>Fine</th>
            <th className={`${table.th} text-right`}>Total due</th>
            <th className={`${table.th} text-right`}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className={table.body}>
          {students.map((s) => {
            const due = totalDue(s);
            const attendance = s.attendance_percentage || 0;
            const heading = headings.get(s.id);
            return (
              <Fragment key={s.id}>
              {heading && <GroupHeading colSpan={8} {...heading} />}
              <tr className={table.row}>
                <td className={table.td}>
                  <p className="font-medium text-slate-900">{s.name}{cohorts.get(s.id) === 'readd' && <ReaddBadge />}</p>
                  <p className="text-xs text-slate-500">{s.college_id} · RU {s.ru_id || '—'} · Sem {s.semester}</p>
                </td>
                <td className={`${table.td} text-center`}>
                  <Badge tone={attendance < MIN_ATTENDANCE_PERCENT ? 'rose' : 'emerald'}>{attendance}%</Badge>
                </td>
                <Due due={s.monthly_due || 0} rate={s.agreed_monthly_fee || 0} />
                <Due due={s.semester_due || 0} rate={s.agreed_semester_fee || 0} />
                <Due due={s.exam_due || 0} rate={s.agreed_ru_exam_fee || 0} />
                <Due due={s.attendance_fine || 0} />
                <td className={`${table.td} text-right`}>
                  {due === 0 ? <Badge tone="emerald" dot>Cleared</Badge> : <span className="font-bold tabular-nums text-rose-600">{taka(due)}</span>}
                </td>
                <td className={`${table.td} text-right`}>
                  <div className="flex justify-end gap-1.5">
                    <Button size="xs" variant="success" icon={HandCoins} onClick={() => onPayment(s)}>Payment</Button>
                    <Button size="xs" variant="secondary" icon={History} onClick={() => onHistory(s)}>History</Button>
                    <Button size="xs" variant="ghost" icon={SlidersHorizontal} onClick={() => onDues(s)}>Edit Dues</Button>
                  </div>
                </td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
