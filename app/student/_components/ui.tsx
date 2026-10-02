import { MIN_ATTENDANCE_PERCENT } from '../../../utils/eligibility';

export function Card({ title, action, children, className = '' }: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={title ? 'px-5 pb-5' : 'p-5'}>{children}</div>
    </section>
  );
}

export { EmptyState } from '../../components/ui';

// Letter grade with its tier tint; the letter itself always carries the meaning.
export function GradeChip({ grade }: { grade: string }) {
  const tone = grade.startsWith('A')
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : grade.startsWith('B')
      ? 'bg-sky-50 text-sky-700 ring-sky-200'
      : grade === 'F'
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';
  return <span className={`inline-flex min-w-9 justify-center rounded-md px-2 py-0.5 text-xs font-black ring-1 ring-inset ${tone}`}>{grade}</span>;
}

// Attendance bar with a tick at the department minimum.
export function AttendanceBar({ percent }: { percent: number }) {
  const ok = percent >= MIN_ATTENDANCE_PERCENT;
  return (
    <div className="relative h-2 w-full rounded-full bg-slate-100" role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      <div className="absolute -top-1 h-4 w-0.5 rounded bg-slate-400" style={{ left: `${MIN_ATTENDANCE_PERCENT}%` }} title={`Minimum ${MIN_ATTENDANCE_PERCENT}%`} />
    </div>
  );
}

export const taka = (amount: number) => `৳${Math.round(amount).toLocaleString()}`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
