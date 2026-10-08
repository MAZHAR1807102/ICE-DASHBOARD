'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, type Student } from '../../../../utils/types';
import Modal from '../../../components/Modal';
import { Button, Field, inputClass } from '../../../components/ui';
import { sessionOf } from '../../../../utils/rollsheet';

// Only these fields are edited here — balances are managed by the finance ledger.
const EDITABLE = ['college_id', 'ru_id', 'name', 'semester', 'advisor', 'student_contact', 'guardian_contact', 'name_bn', 'mother_name', 'father_name', 'session'] as const;
type StudentForm = Partial<Pick<Student, (typeof EDITABLE)[number]>>;

export default function StudentModal({ student, defaultSemester, onClose, onSaved }: {
  student?: Student; // absent = adding a new student
  defaultSemester: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<StudentForm>(() =>
    student ? Object.fromEntries(EDITABLE.map((key) => [key, student[key]])) : { semester: defaultSemester },
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Students sign in with their RU ID, so the login is created (or moved) along with the record.
  const setLogin = async (studentId: string, newPassword?: string) => {
    const response = await fetch('/api/students/set-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, password: newPassword }),
    });
    return response.ok ? null : ((await response.json().catch(() => ({}))).error ?? 'Could not set the login.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const ruId = form.ru_id?.trim() || null;
    const values = { ...form, ru_id: ruId };
    if (student) {
      const { error } = await supabase.from('master_students').update(values).eq('id', student.id);
      if (error) { setIsSaving(false); return setError(error.message); }
      const loginError = ruId && student.ru_id && ruId !== student.ru_id.trim() ? await setLogin(student.id) : null;
      setIsSaving(false);
      return onSaved(loginError ? `Student updated, but the login still uses the old RU ID: ${loginError}` : 'Student updated.');
    }
    const { data, error } = await supabase.from('master_students').insert([values]).select('id').single();
    if (error) { setIsSaving(false); return setError(error.message); }
    const loginError = ruId ? await setLogin(data.id, password) : null;
    setIsSaving(false);
    onSaved(
      !ruId ? 'Student added. Add their RU ID and use “Set Login” so they can sign in.'
        : loginError ? `Student added, but the login wasn't created: ${loginError} Use “Set Login” on their row.`
        : `Student added. They can sign in with RU ID ${ruId} and the password you set.`,
    );
  };

  const field = (key: Exclude<keyof StudentForm, 'semester'>, label: string, required = false, wide = false) => (
    <Field label={label} className={wide ? 'sm:col-span-2' : ''}>
      <input type="text" required={required} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
    </Field>
  );

  return (
    <Modal title={student ? 'Edit Student Profile' : 'Add a student'} description={student ? `${student.name} · ${student.college_id}` : undefined} size="lg" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('name', 'Full name', true, true)}
          {field('college_id', 'College ID', true)}
          {field('ru_id', 'RU ID')}
          <Field label="Semester">
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: parseInt(e.target.value) })} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </Field>
          {field('advisor', 'Advisor')}
          {field('student_contact', 'Student phone')}
          {field('guardian_contact', 'Guardian phone')}
          {!student && (
            <Field label="Portal password" hint={form.ru_id?.trim() ? 'They sign in with their RU ID and this password. At least 6 characters.' : 'Enter the RU ID first — students sign in with it.'} className="sm:col-span-2">
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required={!!form.ru_id?.trim()} minLength={6} disabled={!form.ru_id?.trim()} className={inputClass} autoComplete="off" />
            </Field>
          )}
        </div>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="mb-3 text-sm font-semibold text-slate-900">Printed on RU roll sheets</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('name_bn', 'Name in Bangla', false, true)}
            {field('mother_name', "Mother's name")}
            {field('father_name', "Father's name")}
            <Field label="Session" hint={`Leave blank to use ${sessionOf({ ru_id: form.ru_id ?? null }) || 'the one from the RU ID'}`}>
              <input type="text" value={form.session || ''} onChange={(e) => setForm({ ...form, session: e.target.value })} className={inputClass} placeholder={sessionOf({ ru_id: form.ru_id ?? null }) || 'e.g. 2024-25'} />
            </Field>
          </div>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}
        <Button type="submit" icon={Save} loading={isSaving} className="w-full">{student ? 'Save changes' : 'Add student'}</Button>
      </form>
    </Modal>
  );
}
