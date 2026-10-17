'use client';

import { useMemo, useState } from 'react';
import { Archive, BookOpen, CheckCircle2, Clock, Flag, Mail, Pencil, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, isRunning, type Course, type Student } from '../../../../utils/types';
import { classifyCohorts } from '../../../../utils/cohort';
import { sessionOf } from '../../../../utils/rollsheet';
import { useSessionUser } from '../../../../utils/useSessionUser';
import Modal from '../../../components/Modal';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';
import { useConfirm } from '../../../components/Providers';

type CourseForm = Partial<Course>;

export default function CurriculumTab({ courses: allCourses, students, selectedSemester, onChanged, showMessage, onCourseDeleted }: {
  courses: Course[];
  students: Student[];
  selectedSemester: string;
  onChanged: () => void;
  showMessage: (msg: string) => void;
  onCourseDeleted: (code: string) => void;
}) {
  const confirm = useConfirm();
  const defaultForm = (): CourseForm => ({ semester: parseInt(selectedSemester) || 1, credit: 3 });
  const [newCourse, setNewCourse] = useState<CourseForm>(defaultForm);
  const [editing, setEditing] = useState<Course | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [ending, setEnding] = useState<{ list: Course[]; batch: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const user = useSessionUser();

  // Running courses are worked on; ended ones are kept per batch for the record and exam documents.
  const courses = allCourses.filter(isRunning);
  const ended = useMemo(() => {
    const groups = new Map<string, Course[]>();
    allCourses.filter((c) => !isRunning(c)).forEach((c) => {
      const key = `${c.ended_batch || 'Batch not recorded'} · Semester ${c.semester}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    });
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [allCourses]);

  // The batch a course ran for: the session of the semester's Regular students (e.g. "2024-25").
  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const batchOf = (semester: number) => {
    const regular = students.find((s) => s.semester === semester && cohorts.get(s.id) === 'regular');
    return regular ? sessionOf(regular) : '';
  };

  const endCourses = async () => {
    if (!ending) return;
    if (!ending.batch.trim()) return showMessage('Error: enter the batch (session) these courses ran for.');
    setBusy(true);
    const { error } = await supabase.from('courses')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_batch: ending.batch.trim(), ended_by_name: user?.name ?? null })
      .in('id', ending.list.map((c) => c.id));
    setBusy(false);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`${ending.list.length === 1 ? ending.list[0].course_code : `${ending.list.length} courses`} ended for batch ${ending.batch.trim()}.`);
    setEnding(null);
    onChanged();
  };

  const reopen = async (course: Course) => {
    const ok = await confirm({ title: `Reopen ${course.course_code}?`, body: 'It becomes a running course again: back in attendance, CT entry and the teacher portal.', confirmLabel: 'Reopen' });
    if (!ok) return;
    const { error } = await supabase.from('courses').update({ status: 'running', ended_at: null, ended_batch: null, ended_by_name: null }).eq('id', course.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`${course.course_code} is running again.`);
    onChanged();
  };

  // Emails each course teacher a sign-in link to the Teacher Portal, where they enter CT marks.
  const sendTeacherLinks = async (targets: Course[], key: string) => {
    const withEmail = targets.filter((c) => c.teacher_email);
    if (withEmail.length === 0) return showMessage('Error: none of these courses has a teacher email. Edit the course to add one.');
    const teachers = new Set(withEmail.map((c) => c.teacher_email!.toLowerCase())).size;
    const ok = await confirm({
      title: `Email CT links to ${teachers} teacher${teachers === 1 ? '' : 's'}?`,
      body: `${withEmail.length} course${withEmail.length === 1 ? '' : 's'}${selectedSemester === 'All' ? ' across all semesters' : ` in semester ${selectedSemester}`}. Each teacher gets one email with a sign-in link to enter CT marks.`,
      confirmLabel: 'Send emails',
    });
    if (!ok) return;

    setSendingFor(key);
    const response = await fetch('/api/teacher/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseIds: withEmail.map((c) => c.id) }),
    });
    const result = await response.json().catch(() => ({}));
    setSendingFor(null);

    if (!response.ok) return showMessage(`Error: ${result.error ?? 'Could not send links.'}`);
    const parts = [`Sent to ${result.sent.length} teacher${result.sent.length === 1 ? '' : 's'}.`];
    if (result.failed.length) parts.push(`Failed: ${result.failed.join(', ')}`);
    if (result.missingEmail.length) parts.push(`No email: ${result.missingEmail.join(', ')}`);
    showMessage(parts.join('\n'));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourse.course_code || !newCourse.course_name) return showMessage('Error: course code and title are required.');
    const { error } = await supabase.from('courses').insert([newCourse]);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`Course ${newCourse.course_code} added.`);
    setNewCourse(defaultForm());
    onChanged();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { course_name, teacher_name, teacher_email } = editing;
    const { error } = await supabase.from('courses').update({ course_name, teacher_name, teacher_email }).eq('id', editing.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage('Course updated.');
    setEditing(null);
    onChanged();
  };

  const handleDelete = async (course: Course) => {
    const ok = await confirm({ title: `Delete ${course.course_code}?`, body: course.course_name, confirmLabel: 'Delete course', tone: 'danger' });
    if (!ok) return;
    const { error } = await supabase.from('courses').delete().eq('id', course.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`Course ${course.course_code} deleted.`);
    onCourseDeleted(course.course_code);
    onChanged();
  };

  const text = (form: CourseForm, setForm: (f: CourseForm) => void, key: 'course_code' | 'course_name' | 'teacher_name' | 'teacher_email', label: string, placeholder = '') => (
    <Field label={label}>
      <input type={key === 'teacher_email' ? 'email' : 'text'} placeholder={placeholder} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
    </Field>
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <form onSubmit={handleCreate} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5">
        <p className="mb-4 font-semibold text-slate-900">Add a course</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Semester">
            <select value={newCourse.semester} onChange={(e) => setNewCourse({ ...newCourse, semester: parseInt(e.target.value) })} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </Field>
          {text(newCourse, setNewCourse, 'course_code', 'Course code', 'CSE3101')}
          {text(newCourse, setNewCourse, 'course_name', 'Course title', 'Data Structures')}
          <Field label="Credits">
            <select value={newCourse.credit} onChange={(e) => setNewCourse({ ...newCourse, credit: parseInt(e.target.value) })} className={inputClass}>
              <option value={2}>2 credits — 3 CTs, max 10</option>
              <option value={3}>3 credits — 4 CTs, max 15</option>
            </select>
          </Field>
          {text(newCourse, setNewCourse, 'teacher_name', 'Teacher name', 'Jane Doe')}
          {text(newCourse, setNewCourse, 'teacher_email', 'Teacher email', 'jane@imperial.edu')}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" icon={Plus}>Add to catalog</Button>
        </div>
      </form>

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Running courses {selectedSemester !== 'All' ? `· Semester ${selectedSemester}` : ''}</h3>
            <p className="text-sm text-slate-500">{courses.length} course{courses.length === 1 ? '' : 's'} · {courses.filter((c) => c.ct_saved_at).length} with CT marks submitted</p>
          </div>
          {courses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedSemester !== 'All' && (
                <Button variant="secondary" icon={Flag} onClick={() => setEnding({ list: courses, batch: batchOf(Number(selectedSemester)) })}>
                  End all semester {selectedSemester} courses
                </Button>
              )}
              <Button icon={Send} loading={sendingFor === 'all'} disabled={sendingFor !== null} onClick={() => sendTeacherLinks(courses, 'all')}>
                Email CT links to teachers
              </Button>
            </div>
          )}
        </div>

        {courses.length === 0 ? (
          <Card><EmptyState icon={BookOpen} title="No running courses" body="Add the semester's running courses above." /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <Card key={c.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="violet">Sem {c.semester}</Badge>
                    <Badge>{c.credit} credits</Badge>
                  </div>
                  <div className="-mr-2 -mt-1 flex">
                    <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(c)} aria-label={`Edit ${c.course_code}`} />
                    <Button size="xs" variant="ghost" icon={Trash2} onClick={() => handleDelete(c)} aria-label={`Delete ${c.course_code}`} className="hover:bg-rose-50 hover:text-rose-600" />
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-indigo-600">{c.course_code}</p>
                <h4 className="font-semibold leading-snug text-slate-900">{c.course_name}</h4>
                <div className="mt-3 flex-1 text-sm">
                  <p className="text-slate-700">{c.teacher_name || 'No teacher assigned'}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                    <Mail className="size-3.5 shrink-0" aria-hidden /> {c.teacher_email || 'No email — add one to send CT links'}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {c.ct_saved_at ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="size-4" aria-hidden />
                      CT marks saved {new Date(c.ct_saved_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{c.ct_saved_by ? ` by ${c.ct_saved_by}` : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <Clock className="size-4" aria-hidden /> CT marks not submitted yet
                    </span>
                  )}
                  <div className="flex">
                    {c.teacher_email && (
                      <Button size="xs" variant="ghost" icon={Send} loading={sendingFor === c.id} disabled={sendingFor !== null} onClick={() => sendTeacherLinks([c], c.id)} className="text-indigo-600">
                        Send link
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" icon={Flag} onClick={() => setEnding({ list: [c], batch: batchOf(c.semester) })} className="text-slate-600">
                      End course
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {ended.length > 0 && (
        <div>
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900"><Archive className="size-4 text-slate-500" aria-hidden /> Ended courses</h3>
          <p className="mb-3 text-sm text-slate-500">Kept for the record and exam documents. Teachers can no longer change their CT marks.</p>
          <div className="space-y-4">
            {ended.map(([group, list]) => (
              <Card key={group} className="overflow-hidden">
                <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Batch {group} · {list.length} course{list.length === 1 ? '' : 's'}</p>
                <ul className="divide-y divide-slate-100">
                  {list.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900"><span className="font-mono text-xs text-indigo-600">{c.course_code}</span> {c.course_name}</p>
                        <p className="text-xs text-slate-500">
                          {c.teacher_name || 'No teacher'} · ended {c.ended_at ? new Date(c.ended_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}{c.ended_by_name ? ` by ${c.ended_by_name}` : ''}
                        </p>
                      </div>
                      <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => reopen(c)}>Reopen</Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}

      {ending && (
        <Modal
          title={ending.list.length === 1 ? `End ${ending.list[0].course_code}?` : `End ${ending.list.length} semester ${ending.list[0].semester} courses?`}
          description="The course moves to Ended courses for this batch. It leaves attendance and CT entry, and its teacher can no longer change CT marks. You can reopen it."
          size="sm"
          onClose={() => setEnding(null)}
        >
          <div className="space-y-4">
            {ending.list.length > 1 && <p className="text-sm text-slate-600">{ending.list.map((c) => c.course_code).join(', ')}</p>}
            <Field label="Batch (session)" hint="The batch that took this course — worked out from the semester's Regular students.">
              <input value={ending.batch} onChange={(e) => setEnding({ ...ending, batch: e.target.value })} placeholder="e.g. 2024-25" className={inputClass} autoFocus />
            </Field>
            <Button icon={Flag} loading={busy} onClick={endCourses} className="w-full">
              {ending.list.length === 1 ? 'End course' : `End ${ending.list.length} courses`}
            </Button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit course" description={`${editing.course_code} · Semester ${editing.semester}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleUpdate} className="space-y-4">
            {text(editing, (f) => setEditing(f as Course), 'course_name', 'Course title')}
            {text(editing, (f) => setEditing(f as Course), 'teacher_name', 'Teacher name')}
            {text(editing, (f) => setEditing(f as Course), 'teacher_email', 'Teacher email')}
            <Button type="submit" className="w-full">Save changes</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
