'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { signOut } from '../../utils/session';
import { useSessionUser } from '../../utils/useSessionUser';
import MarksSheet, { type TeacherCourse } from './_components/MarksSheet';

const savedLabel = (iso: string | null) =>
  iso ? `Saved ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Not submitted';

export default function TeacherPortal() {
  const user = useSessionUser();
  const [courses, setCourses] = useState<TeacherCourse[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadCourses = useCallback(() =>
    supabase.rpc('teacher_courses').then(({ data }) => {
      const list = (data ?? []) as TeacherCourse[];
      setCourses(list);
      setSelectedId((current) => current ?? (list.length === 1 ? list[0].id : null));
    }), []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const selected = courses?.find((c) => c.id === selectedId);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[11px] font-black">ICE</div>
            <span className="font-black text-slate-900 whitespace-nowrap">Teacher Portal</span>
            {user?.name && <span className="hidden sm:inline text-sm text-slate-500 truncate">· {user.name}</span>}
          </div>
          <button onClick={() => signOut('/teacher-login')} className="whitespace-nowrap px-3 py-1.5 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg">Log out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-5 items-start">
        <aside className="space-y-2">
          <h1 className="text-xs font-black uppercase tracking-widest text-slate-400 px-1 mb-2">My courses</h1>
          {courses === null && <p className="text-sm text-slate-500 px-1">Loading…</p>}
          {courses?.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
              No courses are assigned to <b>{user?.email}</b> yet. Ask the academic office to add you as the course teacher.
            </div>
          )}
          {courses?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${c.id === selectedId ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-600">{c.course_code}</span>
                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${c.ct_saved_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{savedLabel(c.ct_saved_at)}</span>
              </div>
              <p className="font-bold text-slate-900 leading-snug mt-1">{c.course_name}</p>
              <p className="text-xs text-slate-500 mt-1">Semester {c.semester} · {c.credit} cr · {c.credit === 2 ? 3 : 4} CTs · {c.student_count} students</p>
            </button>
          ))}
        </aside>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-64">
          {selected ? (
            <MarksSheet key={selected.id} course={selected} onSaved={loadCourses} />
          ) : (
            <div className="p-12 text-center text-slate-500">
              <p className="text-3xl mb-2" aria-hidden>📝</p>
              <p className="font-bold text-slate-800">Choose a course</p>
              <p className="text-sm mt-1">Pick one of your courses on the left to enter CT marks.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
