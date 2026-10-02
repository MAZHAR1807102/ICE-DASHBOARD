'use client';

import { useRef, useState } from 'react';
import { ClipboardList, Download, Mail, Save, Upload } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { downloadCsv, parseCsv } from '../../../../utils/csv';
import type { Course, CtMark, Student } from '../../../../utils/types';
import { Button, EmptyState, cx, inputClass, table } from '../../../components/ui';
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

  if (!course) {
    return <EmptyState icon={ClipboardList} title="Select a semester and course" body="Choose a semester and one of its courses above to see and edit CT marks. Teachers can also enter marks themselves in the Teacher portal." />;
  }

  const count = ctCount(course);
  const keys = CT_KEYS.slice(0, count);
  const maxMarks = count === 3 ? 10 : 15;

  const setMark = (studentId: string, key: keyof Marks, value: number) =>
    setEdits({ ...edits, [studentId]: { ...edits[studentId], [key]: value } });

  const handleSave = async (studentId: string) => {
    setSavingId(studentId);
    const { error } = await supabase.from('ct_marks').upsert(
      { student_id: studentId, course_code: course.course_code, ...edits[studentId] },
      { onConflict: 'student_id,course_code' },
    );
    setSavingId(null);
    showMessage(error ? `Error: ${error.message}` : 'Marks saved.');
  };

  const handleEmail = async () => {
    if (!course.teacher_email) return showMessage('Error: this course has no teacher email.');
    setIsSendingEmail(true);
    const sent = await emailRoster(course, 'ct_marks', gradingSheetCsv(students, course)).catch(() => false);
    setIsSendingEmail(false);
    showMessage(sent ? `Grading sheet emailed to ${course.teacher_email}.` : '⚠️ Failed to send the email.');
  };

  // CSV: College ID, RU ID, Name, CT1, CT2, CT3[, CT4]
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        ct4: count === 4 ? parseFloat(cols[6]) || 0 : 0,
      }];
    });

    if (updates.length > 0) {
      const { error } = await supabase.from('ct_marks').upsert(updates, { onConflict: 'student_id,course_code' });
      if (error) return showMessage(`Error: upload failed — ${error.message}`);
    }
    showMessage(`CT marks imported for ${updates.length} students.`);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChanged();
  };

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold text-slate-900">{course.course_code} · {course.course_name}</p>
          <p className="text-sm text-slate-500">{course.teacher_name ?? 'No teacher assigned'} · {count} CTs, each out of {maxMarks}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Mail} loading={isSendingEmail} onClick={handleEmail}>Email grading sheet</Button>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(`${course.course_code}_Grading.csv`, gradingSheetCsv(students, course))}>Download CSV</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700">
            <Upload className="size-4" aria-hidden /> Upload filled CSV
            <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleUpload} />
          </label>
        </div>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No students in this semester" />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Student</th>
                {keys.map((key, i) => <th key={key} className={`${table.th} text-center`}>CT {i + 1}</th>)}
                <th className={`${table.th} text-center`}>Average</th>
                <th className={`${table.th} text-right`}><span className="sr-only">Save</span></th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {students.map((student) => {
                const studentMarks = edits[student.id];
                return (
                  <tr key={student.id} className={table.row}>
                    <td className={table.td}>
                      <p className="font-medium text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.college_id} · RU {student.ru_id || '—'}</p>
                    </td>
                    {keys.map((key) => {
                      const tooHigh = studentMarks[key] > maxMarks;
                      return (
                        <td key={key} className={`${table.td} text-center`}>
                          <input
                            type="number" min="0" max={maxMarks} value={studentMarks[key]} aria-label={`${key.toUpperCase()} for ${student.name}`}
                            onChange={(e) => setMark(student.id, key, parseFloat(e.target.value) || 0)}
                            className={cx(inputClass, 'mx-auto h-8 w-16 text-center font-semibold', tooHigh && 'text-rose-600 ring-rose-400')}
                          />
                        </td>
                      );
                    })}
                    <td className={`${table.td} text-center font-bold tabular-nums text-indigo-700`}>{ctAverage(studentMarks, course)}</td>
                    <td className={`${table.td} text-right`}>
                      <Button size="xs" icon={Save} loading={savingId === student.id} onClick={() => handleSave(student.id)}>Save</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
