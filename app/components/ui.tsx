// Shared design kit: every page builds from these so the whole portal looks like one product.
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// ---------- Buttons ----------
const BUTTON_VARIANTS = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 shadow-sm hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  dark: 'bg-slate-900 text-white shadow-sm hover:bg-slate-800',
};
const BUTTON_SIZES = { xs: 'h-7 px-2.5 text-xs gap-1.5', sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-11 px-5 text-sm gap-2' };

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

// ---------- Surfaces ----------
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx('rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>{children}</section>;
}

export function CardHeader({ title, description, icon: Icon, actions }: { title: string; description?: React.ReactNode; icon?: LucideIcon; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon className="size-4" aria-hidden /></span>}
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  slate: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-slate-900' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  rose: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-600' },
  amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  violet: { icon: 'bg-violet-50 text-violet-600', value: 'text-slate-900' },
  sky: { icon: 'bg-sky-50 text-sky-600', value: 'text-slate-900' },
};
export type Tone = keyof typeof TONES;

export function StatCard({ label, value, hint, icon: Icon, tone = 'slate', footer }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: Tone; footer?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl', TONES[tone].icon)}><Icon className="size-[18px]" aria-hidden /></span>}
      </div>
      <p className={cx('mt-1 text-2xl font-bold tabular-nums tracking-tight sm:text-[28px]', TONES[tone].value)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </Card>
  );
}

const BADGES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export function Badge({ tone = 'slate', children, dot }: { tone?: keyof typeof BADGES; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGES[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Icon className="size-6" aria-hidden /></span>
      <p className="font-semibold text-slate-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; icon?: LucideIcon; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="scroll-thin -mx-1 overflow-x-auto px-1" role="tablist">
      <div className="inline-flex min-w-full gap-1 rounded-xl bg-slate-100 p-1 sm:min-w-0">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            role="tab"
            aria-selected={value === id}
            onClick={() => onChange(id)}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-all sm:flex-none',
              value === id ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {label}
            {count !== undefined && count > 0 && <span className="rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-600">{count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Forms ----------
export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50';

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// ---------- Tables ----------
export const table = {
  wrap: 'scroll-thin relative overflow-x-auto', // relative: keeps sr-only labels inside the scroll area
  table: 'w-full text-left text-sm',
  head: 'border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500',
  th: 'px-4 py-3 whitespace-nowrap',
  body: 'divide-y divide-slate-100',
  row: 'transition-colors hover:bg-slate-50/70',
  td: 'px-4 py-3',
};

// Heading row between the Regular and Readd groups in a student table.
export function GroupHeading({ colSpan, label, count, cohort }: { colSpan: number; label: string; count: number; cohort: 'regular' | 'readd' }) {
  return (
    <tr className={cohort === 'readd' ? 'bg-amber-50/70' : 'bg-slate-50'}>
      <td colSpan={colSpan} className={cx('px-4 py-2 text-xs font-semibold uppercase tracking-wide', cohort === 'readd' ? 'text-amber-800' : 'text-slate-500')}>
        {label} · {count} student{count === 1 ? '' : 's'}
      </td>
    </tr>
  );
}

export function ReaddBadge() {
  return <span className="ml-1.5 inline-flex rounded-full bg-amber-100 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200">Readd</span>;
}

export function CohortSelect({ value, onChange, className }: { value: 'all' | 'regular' | 'readd'; onChange: (v: 'all' | 'regular' | 'readd') => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as 'all' | 'regular' | 'readd')} className={cx(inputClass, className)} aria-label="Regular or Readd">
      <option value="all">Regular + Readd</option>
      <option value="regular">Regular only</option>
      <option value="readd">Readd only</option>
    </select>
  );
}

export const taka = (amount: number) => `৳${Math.round(amount).toLocaleString()}`;
export { cx };
