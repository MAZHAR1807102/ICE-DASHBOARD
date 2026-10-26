'use client';

import { useMemo, useState } from 'react';
import { BookPlus, GraduationCap, Mail, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { isRunning, teachesCourse, type Course, type Teacher } from '../../../../utils/types';
import Modal from '../../../components/Modal';
import { Badge, Button, EmptyState, Field, inputClass, table } from '../../../components/ui';
import { useConfirm } from '../../../components/Providers';

type Form = Partial<Teacher>;
const FIELDS: { key: keyof Teacher; label: string; placeholder: string; type?: string }[] = [
  { key: 'name', label: 'Name', placeholder: 'Mazharul Islam' },
  { key: 'designation', label: 'Designation', placeholder: 'Lecturer' },
  { key: 'email', label: 'Email', placeholder: 'name@gmail.com', type: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '01XXX-XXXXXX' },
  { key: 'department', label: 'Department', placeholder: 'Dept. of CSE, ICE' },
  { key: 'notes', label: 'Notes', placeholder: 'Optional' },
];

// Academic → Teachers: everyone who teaches or has taught, with every course they have had.
export default function TeachersTab({ teachers, courses, onChanged, showMessage }: {
  teachers: Teacher[];
  courses: Course[];
  onChanged: () => void;
  showMessage: (msg: string) => void;
}) {
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Form | null>(null);
  const [assigning, setAssigning] = useState<Teacher | null>(null);
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teachers
      .map((t) => {
        const taught = courses.filter((c) => teachesCourse(t, c));
        return { teacher: t, running: taught.filter(isRunning), ended: taught.filter((c) => !isRunning(c)) };
      })
      .filter(({ teacher: t, running, ended }) => !q || [t.name, t.email, t.phone, t.designation, ...[...running, ...ended].map((c) => c.course_code)]
        .some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => b.running.length - a.running.length || a.teacher.name.localeCompare(b.teacher.name));
  }, [teachers, courses, query]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name?.trim()) return showMessage('Error: the teacher needs a name.');
    const values = Object.fromEntries(FIELDS.map(({ key }) => [key, (editing[key] as string | undefined)?.trim() || null]));
    if (values.email) values.email = (values.email as string).toLowerCase();
    setBusy(true);
    const { error } = editing.id
      ? await supabase.from('teachers').update(values).eq('id', editing.id)
      : await supabase.from('teachers').insert([values]);
    // Keep the teacher's courses in step with a changed name or email.
    if (!error && editing.id) {
      const before = teachers.find((t) => t.id === editing.id);
      const theirs = before ? courses.filter((c) => teachesCourse(before, c)).map((c) => c.id) : [];
      if (theirs.length) await supabase.from('courses').update({ teacher_name: values.name, teacher_email: values.email }).in('id', theirs);
    }
    setBusy(false);
    if (error) return showMessage(`Error: ${/duplicate|unique/i.test(error.message) ? 'a teacher with this email is already on the list.' : error.message}`);
    showMessage(editing.id ? `${values.name} updated.` : `${values.name} added to the teachers list.`);
    setEditing(null);
    onChanged();
  };

  const remove = async (t: Teacher, courseCount: number) => {
    if (courseCount) return showMessage(`Error: ${t.name} still has ${courseCount} course${courseCount === 1 ? '' : 's'}. Assign them to someone else first.`);
    const ok = await confirm({ title: `Remove ${t.name} from the list?`, body: 'Only the list entry is removed — no course is changed.', confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    const { error } = await supabase.from('teachers').delete().eq('id', t.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`${t.name} removed from the list.`);
    onChanged();
  };

  const assign = async () => {
    const course = courses.find((c) => c.id === courseId);
    if (!assigning || !course) return;
    setBusy(true);
    const { error } = await supabase.from('courses').update({ teacher_name: assigning.name, teacher_email: assigning.email }).eq('id', course.id);
    setBusy(false);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`${course.course_code} assigned to ${assigning.name}.`);
    setAssigning(null);
    setCourseId('');
    onChanged();
  };

  const running = courses.filter(isRunning).sort((a, b) => a.semester - b.semester || a.course_code.localeCompare(b.course_code));
  const chip = (c: Course) => (
    <span key={c.id} title={c.course_name} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
      {c.course_code.trim()}<span className="ml-1 font-sans text-slate-400">S{c.semester}{!isRunning(c) && c.ended_batch ? ` · ${c.ended_batch}` : ''}</span>
    </span>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Teachers</h3>
          <p className="text-sm text-slate-500">{teachers.length} teachers · anyone put on a course joins this list automatically</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" placeholder="Search name, email, course" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} pl-9`} />
          </div>
          <Button icon={Plus} onClick={() => setEditing({ department: 'Dept. of CSE, ICE' })}>Add teacher</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title={teachers.length ? 'No teacher matches' : 'No teachers yet'} body={teachers.length ? 'Try another name, email or course code.' : 'Add one here, or put a teacher on a course in Curriculum.'} />
      ) : (
        <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Teacher</th>
                <th className={table.th}>Contact</th>
                <th className={table.th}>Running courses</th>
                <th className={table.th}>Courses taught before</th>
                <th className={`${table.th} text-right`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {rows.map(({ teacher: t, running: now, ended }) => (
                <tr key={t.id} className={`${table.row} align-top`}>
                  <td className={table.td}>
                    <p className="font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{[t.designation, t.department].filter(Boolean).join(' · ') || '—'}</p>
                  </td>
                  <td className={`${table.td} text-xs text-slate-600`}>
                    {t.email ? <p className="flex items-center gap-1"><Mail className="size-3.5 shrink-0 text-slate-400" aria-hidden />{t.email}</p> : <p className="text-amber-700">No email — needed for CT links</p>}
                    {t.phone && <p className="mt-0.5 flex items-center gap-1"><Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden />{t.phone}</p>}
                  </td>
                  <td className={table.td}><div className="flex max-w-64 flex-wrap gap-1">{now.length ? now.map(chip) : <span className="text-xs text-slate-400">—</span>}</div></td>
                  <td className={table.td}><div className="flex max-w-64 flex-wrap gap-1">{ended.length ? ended.map(chip) : <span className="text-xs text-slate-400">—</span>}</div></td>
                  <td className={`${table.td} text-right`}>
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="ghost" icon={BookPlus} onClick={() => { setAssigning(t); setCourseId(''); }}>Assign course</Button>
                      <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} />
                      <Button size="xs" variant="ghost" icon={Trash2} onClick={() => remove(t, now.length + ended.length)} aria-label={`Remove ${t.name}`} className="hover:bg-rose-50 hover:text-rose-600" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.name}` : 'Add a teacher'} description={editing.id ? 'A changed name or email is also updated on their courses.' : undefined} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map(({ key, label, placeholder, type }) => (
              <Field key={key} label={label} className={key === 'notes' ? 'sm:col-span-2' : ''}>
                <input type={type ?? 'text'} required={key === 'name'} value={(editing[key] as string) ?? ''} placeholder={placeholder} onChange={(e) => setEditing({ ...editing, [key]: e.target.value })} className={inputClass} />
              </Field>
            ))}
            <Button type="submit" loading={busy} className="sm:col-span-2">{editing.id ? 'Save changes' : 'Add teacher'}</Button>
          </form>
        </Modal>
      )}

      {assigning && (
        <Modal title={`Assign a course to ${assigning.name}`} description="They become the course's teacher; the course's CT link goes to their email." size="sm" onClose={() => setAssigning(null)}>
          <div className="space-y-4">
            <Field label="Running course">
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputClass}>
                <option value="">Choose a course…</option>
                {running.map((c) => (
                  <option key={c.id} value={c.id}>
                    Sem {c.semester} · {c.course_code.trim()} — {c.course_name.trim()}{c.teacher_name ? ` (now: ${c.teacher_name.trim()})` : ' (no teacher)'}
                  </option>
                ))}
              </select>
            </Field>
            {running.length === 0 && <p className="text-sm text-slate-500">No running courses. Add them in Curriculum first.</p>}
            <Button icon={BookPlus} loading={busy} disabled={!courseId} onClick={assign} className="w-full">Assign</Button>
            {!assigning.email && <Badge tone="amber">No email on file — they will not get the CT link</Badge>}
          </div>
        </Modal>
      )}
    </div>
  );
}
