'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, type Student } from '../../../../utils/types';
import Modal from '../../../components/Modal';
import { Button, Field, inputClass } from '../../../components/ui';

// Only these fields are edited here — balances are managed by the finance ledger.
const EDITABLE = ['college_id', 'ru_id', 'name', 'semester', 'advisor', 'student_contact', 'guardian_contact'] as const;
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
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const { error } = student
      ? await supabase.from('master_students').update(form).eq('id', student.id)
      : await supabase.from('master_students').insert([form]);
    setIsSaving(false);
    if (error) return setError(error.message);
    onSaved(student ? 'Student updated.' : 'Student added.');
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
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}
        <Button type="submit" icon={Save} loading={isSaving} className="w-full">{student ? 'Save changes' : 'Add student'}</Button>
      </form>
    </Modal>
  );
}
