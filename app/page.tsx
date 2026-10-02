import Link from 'next/link';

const PORTALS = [
  {
    href: '/login',
    title: 'Faculty Portal',
    description: 'Finance, academic coordination, exams and department overview.',
    action: 'Faculty sign in',
    style: 'bg-slate-900 hover:bg-slate-800',
  },
  {
    href: '/student-login',
    title: 'Student Portal',
    description: 'Your CT marks, attendance, dues and department notices.',
    action: 'Student sign in',
    style: 'bg-indigo-600 hover:bg-indigo-700',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-16 font-sans">
      <div className="flex justify-center -space-x-2 mb-6">
        <div className="w-16 h-16 rounded-full bg-white shadow-md border-2 border-slate-200 flex items-center justify-center z-10">
          <span className="text-sm font-black text-slate-400">ICE</span>
        </div>
        <div className="w-16 h-16 rounded-full bg-indigo-50 shadow-md border-2 border-indigo-200 flex items-center justify-center">
          <span className="text-xs font-bold text-indigo-500">CSE</span>
        </div>
      </div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-center">Department of CSE</h1>
      <p className="mt-2 text-slate-600 text-center">Imperial College of Engineering — Student Management</p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {PORTALS.map((portal) => (
          <div key={portal.href} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
            <h2 className="text-lg font-black text-slate-900">{portal.title}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6 flex-grow">{portal.description}</p>
            <Link href={portal.href} className={`block text-center py-2.5 rounded-lg text-white font-bold transition-colors ${portal.style}`}>
              {portal.action}
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
