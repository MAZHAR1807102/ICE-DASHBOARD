'use client';

import { useState } from 'react';
import { Save, UserCheck } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { cx, Button, inputClass, table } from '../../../components/ui';
import type { Course, Teacher } from '../../../../utils/types';

type Draft = { teacher_name: string; teacher_email: string };

// Curriculum → Assign teachers: every running course of the chosen semester with a teacher box.
// Type a name or pick one of the suggestions (the Teachers list); picking fills in the email.
// A new name is added to the Teachers list when saved.
export default function AssignTeachers({ courses, teachers, semesterLabel, onChanged, showMessage }: {
  courses: Course[];
  teachers: Teacher[];
  semesterLabel: string;
  onChanged: () => void;
  showMessage: (msg: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);

  const current = (c: Course): Draft => drafts[c.id] ?? { teacher_name: c.teacher_name?.trim() ?? '', teacher_email: c.teacher_email?.trim() ?? '' };
  const changed = courses.filter((c) => {
    const d = drafts[c.id];
    return d && (d.teacher_name.trim() !== (c.teacher_name?.trim() ?? '') || d.teacher_email.trim().toLowerCase() !== (c.teacher_email?.trim().toLowerCase() ?? ''));
  });

  const setName = (c: Course, name: string) => {
    const match = teachers.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    // A new name must not keep another teacher's email; an email typed for this new name stays.
    const email = current(c).teacher_email;
    const emailOfSomeoneElse = teachers.some((t) => t.email && t.email === email.trim().toLowerCase());
    setDrafts({ ...drafts, [c.id]: { teacher_name: match ? match.name : name, teacher_email: match ? match.email ?? '' : emailOfSomeoneElse ? '' : email } });
  };
  const setEmail = (c: Course, email: string) => setDrafts({ ...drafts, [c.id]: { ...current(c), teacher_email: email } });

  const save = async () => {
    setBusy(true);
    const results = await Promise.all(changed.map((c) => {
      const d = current(c);
      return supabase.from('courses').update({ teacher_name: d.teacher_name.trim() || null, teacher_email: d.teacher_email.trim().toLowerCase() || null }).eq('id', c.id);
    }));
    setBusy(false);
    const failed = results.filter((r) => r.error);
    if (failed.length) return showMessage(`Error: ${failed.length} not saved — ${failed[0].error!.message}`);
    showMessage(`Teachers saved for ${changed.length} course${changed.length === 1 ? '' : 's'}.`);
    setDrafts({});
    onChanged();
  };

  if (courses.length === 0) return null;

  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900"><UserCheck className="size-4 text-indigo-600" aria-hidden /> Assign teachers · {semesterLabel}</p>
          <p className="text-xs text-slate-500">Type a name or pick a suggestion — the email fills in. A new name joins the Teachers list.</p>
        </div>
        <Button icon={Save} loading={busy} disabled={changed.length === 0} onClick={save}>
          {changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Save'}
        </Button>
      </div>
      <div className={table.wrap}>
        <table className={table.table}>
          <thead className={table.head}>
            <tr>
              <th className="px-4 py-2">Course</th>
              <th className="px-4 py-2">Teacher</th>
              <th className="px-4 py-2">Email</th>
            </tr>
          </thead>
          <tbody className={table.body}>
            {courses.map((c) => {
              const d = current(c);
              const dirty = changed.includes(c);
              const known = teachers.some((t) => t.name.toLowerCase() === d.teacher_name.trim().toLowerCase());
              return (
                <tr key={c.id} className={cx(dirty && 'bg-indigo-50/50')}>
                  <td className="px-4 py-2">
                    <p className="font-mono text-xs font-semibold text-indigo-600">{c.course_code.trim()} <span className="font-sans font-normal text-slate-400">· Sem {c.semester} · {c.credit} cr</span></p>
                    <p className="text-sm text-slate-800">{c.course_name.trim()}</p>
                  </td>
                  <td className="px-4 py-2">
                    <div className="min-w-48">
                      <input list="teacher-names" value={d.teacher_name} onChange={(e) => setName(c, e.target.value)} placeholder="Type or pick a teacher" className={cx(inputClass, 'h-9 text-sm')} aria-label={`Teacher for ${c.course_code.trim()}`} autoComplete="off" />
                    </div>
                    {d.teacher_name.trim() && !known && <p className="mt-1 text-[11px] font-medium text-violet-700">New — joins the Teachers list</p>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="min-w-52">
                      <input type="email" list="teacher-emails" value={d.teacher_email} onChange={(e) => setEmail(c, e.target.value)} placeholder="name@gmail.com" className={cx(inputClass, 'h-9 text-sm')} aria-label={`Teacher email for ${c.course_code.trim()}`} autoComplete="off" />
                    </div>
                    {d.teacher_name.trim() && !d.teacher_email.trim() && <p className="mt-1 text-[11px] text-amber-700">No email — no CT link</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
