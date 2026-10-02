import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

// Logo mark + wordmark used in every top bar and on the sign-in screens.
export default function Brand({ subtitle, href = '/', inverted = false }: { subtitle?: string; href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${inverted ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'}`}>
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block truncate text-[15px] font-bold tracking-tight ${inverted ? 'text-white' : 'text-slate-900'}`}>CSE Portal</span>
        {subtitle && <span className={`block truncate text-xs ${inverted ? 'text-indigo-100' : 'text-slate-500'}`}>{subtitle}</span>}
      </span>
    </Link>
  );
}
