'use client';

import { useState } from 'react';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, type Course } from '../../../../utils/types';
import Modal from '../../../components/Modal';

type CourseForm = Partial<Course>;

export default function CurriculumTab({ courses, selectedSemester, onChanged, showMessage, onCourseDeleted }: {
  courses: Course[];
  selectedSemester: string;
  onChanged: () => void;
  showMessage: (msg: string) => void;
  onCourseDeleted: (code: string) => void;
}) {
  const defaultForm = (): CourseForm => ({ semester: parseInt(selectedSemester) || 1, credit: 3 });
  const [newCourse, setNewCourse] = useState<CourseForm>(defaultForm);
  const [editing, setEditing] = useState<Course | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  // Emails each course teacher a sign-in link to the Teacher Portal, where they enter CT marks.
  const sendTeacherLinks = async (targets: Course[], key: string) => {
    const withEmail = targets.filter((c) => c.teacher_email);
    if (withEmail.length === 0) return alert('None of these courses has a teacher email. Edit the course to add one.');
    const teachers = new Set(withEmail.map((c) => c.teacher_email!.toLowerCase())).size;
    if (!window.confirm(`Email a CT-entry link to ${teachers} teacher${teachers === 1 ? '' : 's'} for ${withEmail.length} course${withEmail.length === 1 ? '' : 's'}?`)) return;

    setSendingFor(key);
    const response = await fetch('/api/teacher/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseIds: withEmail.map((c) => c.id) }),
    });
    const result = await response.json().catch(() => ({}));
    setSendingFor(null);

    if (!response.ok) return showMessage(`⚠️ ${result.error ?? 'Could not send links.'}`);
    const parts = [`✅ Sent to ${result.sent.length} teacher${result.sent.length === 1 ? '' : 's'}`];
    if (result.failed.length) parts.push(`failed: ${result.failed.join(', ')}`);
    if (result.missingEmail.length) parts.push(`no email: ${result.missingEmail.join(', ')}`);
    showMessage(parts.join(' · '));
  };

  const handleCreate = async () => {
    if (!newCourse.course_code || !newCourse.course_name) return alert('Course Code and Name are required.');
    const { error } = await supabase.from('courses').insert([newCourse]);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`Course ${newCourse.course_code} created.`);
    setNewCourse(defaultForm());
    onChanged();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const { course_name, teacher_name, teacher_email } = editing;
    const { error } = await supabase.from('courses').update({ course_name, teacher_name, teacher_email }).eq('id', editing.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage('Course updated successfully.');
    setEditing(null);
    onChanged();
  };

  const handleDelete = async (course: Course) => {
    if (!window.confirm(`Are you sure you want to delete course ${course.course_code}?`)) return;
    const { error } = await supabase.from('courses').delete().eq('id', course.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`Course ${course.course_code} deleted.`);
    onCourseDeleted(course.course_code);
    onChanged();
  };

  const inputClass = 'w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500';
  const labelClass = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';
  const textField = (form: CourseForm, setForm: (f: CourseForm) => void, key: 'course_code' | 'course_name' | 'teacher_name' | 'teacher_email', label: string, placeholder = '') => (
    <div>
      <label className={labelClass}>{label}</label>
      <input type={key === 'teacher_email' ? 'email' : 'text'} placeholder={placeholder} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
    </div>
  );

  return (
    <div className="p-6 space-y-8 bg-slate-50/50">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 pb-3 mb-5">
          <h3 className="text-lg font-bold text-slate-800">Create New Course / Assign Faculty</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className={labelClass}>Semester</label>
            <select value={newCourse.semester} onChange={(e) => setNewCourse({ ...newCourse, semester: parseInt(e.target.value) })} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
          {textField(newCourse, setNewCourse, 'course_code', 'Course Code', 'CSE-3101')}
          {textField(newCourse, setNewCourse, 'course_name', 'Course Title', 'Data Structures')}
          <div>
            <label className={labelClass}>Credits</label>
            <select value={newCourse.credit} onChange={(e) => setNewCourse({ ...newCourse, credit: parseInt(e.target.value) })} className={inputClass}>
              <option value={2}>2 Credits (3 CTs, Max 10)</option>
              <option value={3}>3 Credits (4 CTs, Max 15)</option>
            </select>
          </div>
          {textField(newCourse, setNewCourse, 'teacher_name', 'Faculty Name', 'Jane Doe')}
          {textField(newCourse, setNewCourse, 'teacher_email', 'Faculty Email', 'jane@imperial.edu')}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={handleCreate} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 shadow-md">+ Add to Catalog</button>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-slate-800">Course Catalog {selectedSemester !== 'All' ? `(Semester ${selectedSemester})` : ''}</h3>
          {courses.length > 0 && (
            <button
              onClick={() => sendTeacherLinks(courses, 'all')}
              disabled={sendingFor !== null}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-50"
            >
              {sendingFor === 'all' ? 'Sending…' : `📧 Email CT links to teachers (${courses.length} courses)`}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((c) => (
            <div key={c.id} className="p-5 border border-slate-200 rounded-xl shadow-sm bg-white hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-full">Sem {c.semester}</span>
                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-bold border border-slate-200">{c.credit} Cr</span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-lg mt-2">{c.course_code}</h4>
              <p className="font-medium text-slate-700 text-sm mb-3">{c.course_name}</p>
              <div className="pt-3 border-t border-slate-100 flex justify-between items-end">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Instructor</p>
                  <p className="text-sm font-medium text-slate-800">{c.teacher_name}</p>
                  <p className="text-xs text-slate-500 truncate">{c.teacher_email || 'No email — add one to send CT links'}</p>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                  <button onClick={() => setEditing(c)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-xs font-bold">Edit</button>
                  <button onClick={() => handleDelete(c)} className="p-1.5 bg-rose-50 text-rose-600 rounded hover:bg-rose-100 text-xs font-bold">Del</button>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className={`text-xs font-bold ${c.ct_saved_at ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {c.ct_saved_at
                    ? `CT marks saved ${new Date(c.ct_saved_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${c.ct_saved_by ? ` by ${c.ct_saved_by}` : ''}`
                    : 'CT marks not submitted yet'}
                </span>
                {c.teacher_email && (
                  <button onClick={() => sendTeacherLinks([c], c.id)} disabled={sendingFor !== null} className="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                    {sendingFor === c.id ? 'Sending…' : 'Send link'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {courses.length === 0 && (
            <div className="col-span-full bg-white p-8 rounded-xl border border-dashed border-slate-300 text-center">
              <p className="text-slate-500 font-medium">No courses found for this filter.</p>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <Modal title="Edit Course" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            {textField(editing, (f) => setEditing(f as Course), 'course_name', 'Course Title')}
            {textField(editing, (f) => setEditing(f as Course), 'teacher_name', 'Faculty Name')}
            {textField(editing, (f) => setEditing(f as Course), 'teacher_email', 'Faculty Email')}
            <button onClick={handleUpdate} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg transition-colors">Update Course</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
