'use client';

import { useState } from 'react';
import { BookOpen, CheckCircle2, Clock, Mail, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, type Course } from '../../../../utils/types';
import Modal from '../../../components/Modal';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';
import { useConfirm } from '../../../components/Providers';

type CourseForm = Partial<Course>;

export default function CurriculumTab({ courses, selectedSemester, onChanged, showMessage, onCourseDeleted }: {
  courses: Course[];
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
            <h3 className="font-semibold text-slate-900">Course Catalog {selectedSemester !== 'All' ? `· Semester ${selectedSemester}` : ''}</h3>
            <p className="text-sm text-slate-500">{courses.length} course{courses.length === 1 ? '' : 's'} · {courses.filter((c) => c.ct_saved_at).length} with CT marks submitted</p>
          </div>
          {courses.length > 0 && (
            <Button icon={Send} loading={sendingFor === 'all'} disabled={sendingFor !== null} onClick={() => sendTeacherLinks(courses, 'all')}>
              Email CT links to teachers
            </Button>
          )}
        </div>

        {courses.length === 0 ? (
          <Card><EmptyState icon={BookOpen} title="No courses yet" body="Add the semester's running courses above." /></Card>
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
                  {c.teacher_email && (
                    <Button size="xs" variant="ghost" icon={Send} loading={sendingFor === c.id} disabled={sendingFor !== null} onClick={() => sendTeacherLinks([c], c.id)} className="text-indigo-600">
                      Send link
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

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
