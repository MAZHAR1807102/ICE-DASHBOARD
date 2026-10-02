import Link from 'next/link';
import { ArrowRight, BookOpenCheck, ClipboardEdit, GraduationCap, ReceiptText, ShieldCheck, UserRound } from 'lucide-react';
import Brand from './components/Brand';

const PORTALS = [
  {
    href: '/student-login',
    title: 'Student Portal',
    description: 'Results and CGPA, CT marks, attendance, fees and notices.',
    action: 'Student sign in',
    icon: UserRound,
    accent: 'from-indigo-500 to-violet-600',
  },
  {
    href: '/teacher-login',
    title: 'Course Teachers',
    description: 'Enter CT marks for the courses you teach. Sign in with an emailed link.',
    action: 'Teacher sign in',
    icon: ClipboardEdit,
    accent: 'from-violet-500 to-purple-600',
  },
  {
    href: '/login',
    title: 'Faculty Portal',
    description: 'Finance, academic coordination, exams and the department overview.',
    action: 'Faculty sign in',
    icon: ShieldCheck,
    accent: 'from-slate-700 to-slate-900',
  },
];

const FEATURES = [
  { icon: GraduationCap, title: 'Results & CGPA', body: 'Semester grades published by the exam office, with GPA trends.' },
  { icon: BookOpenCheck, title: 'Attendance & CT marks', body: 'Per-course attendance and CT marks entered by each teacher.' },
  { icon: ReceiptText, title: 'Fees & receipts', body: 'Every bill and payment recorded, with a receipt for each.' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-200/50 via-violet-200/40 to-sky-200/40 blur-3xl" aria-hidden />

        <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand subtitle="Imperial College of Engineering" />
          <Link href="/login" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">Faculty sign in</Link>
        </header>

        <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Department of Computer Science & Engineering
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            Your department, <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">all in one place</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-600 sm:text-lg">
            Results, attendance, CT marks and fees for students — and the tools staff and teachers use to keep them up to date.
          </p>

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 text-left md:grid-cols-3">
            {PORTALS.map(({ href, title, description, action, icon: Icon, accent }) => (
              <Link key={href} href={href} className="group flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-slate-300">
                <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${accent}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
                <p className="mt-1 flex-1 text-sm text-slate-500">{description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                  {action} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="size-6 text-indigo-600" aria-hidden />
            <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Department of CSE · Imperial College of Engineering
      </footer>
    </div>
  );
}
