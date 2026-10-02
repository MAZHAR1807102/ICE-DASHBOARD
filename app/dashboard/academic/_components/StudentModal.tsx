'use client';

import { useState } from 'react';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS, type Student } from '../../../../utils/types';
import Modal from '../../../components/Modal';

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

  const handleSave = async () => {
    if (!form.name || !form.college_id) return alert('Name and College ID are required.');
    const { error } = student
      ? await supabase.from('master_students').update(form).eq('id', student.id)
      : await supabase.from('master_students').insert([form]);
    if (error) return alert(`Error: ${error.message}`);
    onSaved(student ? 'Student updated successfully.' : 'Student added successfully.');
  };

  const field = (key: Exclude<keyof StudentForm, 'semester'>, label: string, wide = false) => (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="block text-sm font-bold text-slate-700 mb-1">{label}</label>
      <input
        type="text"
        value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <Modal title={student ? 'Edit Student Profile' : 'Add New Student'} size="lg" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {field('college_id', 'College ID *')}
          {field('ru_id', 'RU ID')}
          {field('name', 'Full Name *', true)}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Semester</label>
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: parseInt(e.target.value) })} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
          {field('advisor', 'Assigned Advisor')}
          {field('student_contact', 'Student Contact Number', true)}
          {field('guardian_contact', 'Guardian Contact Number', true)}
        </div>
        <button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors">Save Student Record</button>
      </div>
    </Modal>
  );
}
