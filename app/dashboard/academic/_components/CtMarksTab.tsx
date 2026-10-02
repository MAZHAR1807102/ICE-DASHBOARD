'use client';

import { useRef, useState } from 'react';
import { supabase } from '../../../../utils/supabase';
import { downloadCsv, parseCsv } from '../../../../utils/csv';
import type { Course, CtMark, Student } from '../../../../utils/types';
import { ctAverage, ctCount, emailRoster, gradingSheetCsv, readFileText } from './shared';

type Marks = { ct1: number; ct2: number; ct3: number; ct4: number };
const CT_KEYS = ['ct1', 'ct2', 'ct3', 'ct4'] as const;

// Remounted (via `key`) whenever the selected course or its marks change, so edits start fresh.
export default function CtMarksTab({ students, course, marks, onChanged, showMessage }: {
  students: Student[];
  course?: Course;
  marks: Record<string, CtMark>;
  onChanged: () => void;
  showMessage: (msg: string) => void;
}) {
  const [edits, setEdits] = useState<Record<string, Marks>>(() =>
    Object.fromEntries(students.map((s) => {
      const m = marks[s.id];
      return [s.id, { ct1: Number(m?.ct1) || 0, ct2: Number(m?.ct2) || 0, ct3: Number(m?.ct3) || 0, ct4: Number(m?.ct4) || 0 }];
    })),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTwoCredit = course?.credit === 2;
  const maxMarks = isTwoCredit ? 10 : 15;

  const setMark = (studentId: string, key: keyof Marks, value: number) =>
    setEdits({ ...edits, [studentId]: { ...edits[studentId], [key]: value } });

  const handleSave = async (studentId: string) => {
    if (!course) return alert('Select a course first.');
    setSavingId(studentId);
    const { error } = await supabase.from('ct_marks').upsert(
      { student_id: studentId, course_code: course.course_code, ...edits[studentId] },
      { onConflict: 'student_id,course_code' },
    );
    setSavingId(null);
    showMessage(error ? `Error: ${error.message}` : 'Marks saved.');
  };

  const handleEmail = async () => {
    if (!course) return;
    if (!course.teacher_email) return alert('This course does not have a valid teacher email configured.');
    setIsSendingEmail(true);
    showMessage(`Preparing to email template to ${course.teacher_email}...`);
    const sent = await emailRoster(course, 'ct_marks', gradingSheetCsv(students, course)).catch(() => false);
    setIsSendingEmail(false);
    showMessage(sent ? '✅ Email sent successfully!' : '⚠️ Failed to send email.');
  };

  // CSV: College ID, RU ID, Name, CT1, CT2, CT3[, CT4]
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !course) return;

    const rows = parseCsv(await readFileText(file)).slice(1);
    const updates = rows.flatMap((cols) => {
      const student = students.find((s) => s.college_id === cols[0]?.trim());
      if (!student) return [];
      return [{
        student_id: student.id,
        course_code: course.course_code,
        ct1: parseFloat(cols[3]) || 0,
        ct2: parseFloat(cols[4]) || 0,
        ct3: parseFloat(cols[5]) || 0,
        ct4: ctCount(course) === 4 ? parseFloat(cols[6]) || 0 : 0,
      }];
    });

    if (updates.length > 0) {
      const { error } = await supabase.from('ct_marks').upsert(updates, { onConflict: 'student_id,course_code' });
      if (error) return alert(`Upload failed: ${error.message}`);
    }
    showMessage(`CT Marks imported for ${updates.length} students.`);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChanged();
  };

  const inputClass = 'w-14 border border-slate-300 rounded p-1 text-sm font-medium text-center focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <>
      {course && (
        <div className="bg-indigo-50 border-b border-indigo-100 p-4 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-indigo-900">Teacher Grading Workflow</h3>
            <p className="text-xs text-indigo-700 font-medium">Coordinating roster for {course.teacher_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleEmail} disabled={isSendingEmail} className="px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed rounded-md text-xs font-bold shadow-sm transition-colors">📧 {isSendingEmail ? 'Sending...' : 'Email Grading Sheet'}</button>
            <button onClick={() => downloadCsv(`${course.course_code}_Grading.csv`, gradingSheetCsv(students, course))} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-md text-xs font-bold hover:bg-indigo-100 shadow-sm transition-colors">⬇️ Download CSV</button>
            <label className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 cursor-pointer shadow-sm transition-colors">⬆️ Upload Filled CSV <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleUpload} /></label>
          </div>
        </div>
      )}

      <div className="overflow-x-auto p-4">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-indigo-50/50 border-b border-indigo-100">
              <th className="p-3 text-sm font-bold text-indigo-800">College ID</th>
              <th className="p-3 text-sm font-bold text-indigo-800">RU ID</th>
              <th className="p-3 text-sm font-bold text-indigo-800">Name</th>
              {CT_KEYS.map((key, i) => <th key={key} className="p-3 text-sm font-bold text-indigo-800 w-16 text-center">CT-{i + 1}</th>)}
              <th className="p-3 text-sm font-black text-indigo-900 bg-indigo-100 w-20 text-center">Avg</th>
              <th className="p-3 text-sm font-bold text-indigo-800 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {course && students.map((student) => {
              const studentMarks = edits[student.id];
              return (
                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-sm font-medium text-slate-900">{student.college_id}</td>
                  <td className="p-3 text-sm text-slate-500">{student.ru_id || 'N/A'}</td>
                  <td className="p-3 text-sm font-medium text-slate-700">{student.name}</td>
                  {CT_KEYS.map((key) => (
                    <td key={key} className="p-3 text-sm text-center">
                      {key === 'ct4' && isTwoCredit
                        ? <span className="text-slate-400 text-xs font-bold italic bg-slate-100 px-2 py-1 rounded">N/A</span>
                        : <input type="number" min="0" max={maxMarks} value={studentMarks[key]} onChange={(e) => setMark(student.id, key, parseFloat(e.target.value) || 0)} className={inputClass} />}
                    </td>
                  ))}
                  <td className="p-3 text-sm text-center font-black text-indigo-700 bg-indigo-50/50">{ctAverage(studentMarks, course)}</td>
                  <td className="p-3 text-sm text-center">
                    <button onClick={() => handleSave(student.id)} disabled={savingId === student.id} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                      {savingId === student.id ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {(!course || students.length === 0) && <tr><td colSpan={9} className="p-10 text-center text-slate-500 font-medium bg-slate-50/50">Select a semester and course to view the roster.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
