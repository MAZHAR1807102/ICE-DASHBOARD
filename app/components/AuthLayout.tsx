import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Brand from './Brand';

// Split-screen sign-in: brand panel on the left (desktop), form on the right; single column on phones.
export default function AuthLayout({ title, subtitle, highlights, accent = 'from-indigo-600 via-indigo-600 to-violet-700', children, footer }: {
  title: string;
  subtitle: string;
  highlights: string[];
  accent?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className={`relative hidden overflow-hidden bg-gradient-to-br ${accent} p-12 lg:flex lg:flex-col lg:justify-between`}>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-400/20 blur-3xl" aria-hidden />
        <Brand subtitle="Department of CSE" inverted />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-200">Imperial College of Engineering</p>
          <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-white">{title}</h2>
          <ul className="mt-8 space-y-3">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-3 text-indigo-50"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-indigo-200" aria-hidden />{h}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-200">© {new Date().getFullYear()} Department of CSE</p>
      </aside>

      <main className="flex flex-col bg-white px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <div className="lg:hidden"><Brand subtitle="Department of CSE" /></div>
          <Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="size-4" aria-hidden /> Home
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{subtitle}</h1>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
