'use client';

import { useRef, useState } from 'react';
import { supabase } from '../../../../utils/supabase';
import { parseCsv } from '../../../../utils/csv';
import { MIN_ATTENDANCE_PERCENT } from '../../../../utils/eligibility';
import type { Course, CtMark, Student } from '../../../../utils/types';
import { attendanceSheetCsv, emailRoster, readFileText, refreshGlobalAttendance } from './shared';

// Remounted (via `key`) whenever the selected course or its marks change, so edits start fresh.
export default function RosterTab({ students, course, marks, onChanged, showMessage, onEditStudent }: {
  students: Student[];
  course?: Course;
  marks: Record<string, CtMark>;
  onChanged: () => void;
  showMessage: (msg: string) => void;
  onEditStudent: (student: Student) => void;
}) {
  const [attendance, setAttendance] = useState<Record<string, number>>(() =>
    Object.fromEntries(students.map((s) => [s.id, Number(marks[s.id]?.course_attendance) || 0])),
  );
  const [sheetUrl, setSheetUrl] = useState(course?.attendance_sheet_url ?? '');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveAttendance = async (studentId: string) => {
    if (!course) return;
    setSavingId(studentId);
    await supabase.from('ct_marks').upsert(
      { student_id: studentId, course_code: course.course_code, course_attendance: attendance[studentId] },
      { onConflict: 'student_id,course_code' },
    );
    await refreshGlobalAttendance([studentId]);
    setSavingId(null);
    showMessage(`Attendance saved for ${course.course_code}.`);
    onChanged();
  };

  const handleSaveSheetUrl = async () => {
    if (!course) return;
    setSavingId('sheet');
    const { error } = await supabase.from('courses').update({ attendance_sheet_url: sheetUrl }).eq('id', course.id);
    setSavingId(null);
    if (error) return alert('Failed to save link.');
    showMessage('Google Sheet Link saved successfully.');
    onChanged();
  };

  const handleEmail = async () => {
    if (!course) return;
    if (!course.teacher_email) return alert('This course does not have a valid teacher email configured.');
    setIsSendingEmail(true);
    showMessage(`Preparing to email template to ${course.teacher_email}...`);
    const sent = await emailRoster(course, 'attendance', attendanceSheetCsv(students)).catch(() => false);
    setIsSendingEmail(false);
    showMessage(sent ? '✅ Email sent successfully!' : '⚠️ Failed to send email.');
  };

  // CSV: College ID, RU ID, Name, Total Classes Held, Classes Attended
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !course) return;

    const rows = parseCsv(await readFileText(file)).slice(1);
    const updates = rows.flatMap((cols) => {
      const student = students.find((s) => s.college_id === cols[0]?.trim());
      if (!student) return [];
      const held = parseFloat(cols[3]) || 0;
      const attended = parseFloat(cols[4]) || 0;
      const percent = held > 0 ? Math.round((attended / held) * 100) : attended > 0 ? attended : attendance[student.id] || 0;
      return [{ student_id: student.id, course_code: course.course_code, course_attendance: Math.min(percent, 100) }];
    });

    if (updates.length > 0) {
      const { error } = await supabase.from('ct_marks').upsert(updates, { onConflict: 'student_id,course_code' });
      if (error) return alert(`Upload failed: ${error.message}`);
      await refreshGlobalAttendance(updates.map((u) => u.student_id));
    }
    showMessage(`Calculated and published attendance for ${updates.length} students.`);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChanged();
  };

  const handleToggleOverride = async (student: Student) => {
    const enabled = !student.eligibility_override;
    const { error } = await supabase.from('master_students').update({ eligibility_override: enabled }).eq('id', student.id);
    if (error) return alert(`Error: ${error.message}`);
    showMessage(`Eligibility override ${enabled ? 'ENABLED' : 'DISABLED'} for ${student.name}`);
    onChanged();
  };

  const handleSetLogin = async (student: Student) => {
    const password = window.prompt(`Set a portal password for ${student.name} (RU ID ${student.ru_id || 'not set'}).\nMinimum 6 characters:`);
    if (password === null) return;
    if (password.length < 6) return alert('Password must be at least 6 characters long.');

    const response = await fetch('/api/students/set-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, password }),
    });
    const result = await response.json();
    showMessage(response.ok ? result.message : `Error: ${result.error}`);
  };

  const handleDelete = async (student: Student) => {
    if (!window.confirm(`Are you sure you want to permanently delete student: ${student.name}?`)) return;
    const { error } = await supabase.from('master_students').delete().eq('id', student.id);
    if (!error) { showMessage(`${student.name} has been deleted.`); onChanged(); }
    else if (error.code === '23503') showMessage(`${student.name} has payment or marks history and can't be deleted — financial records must be kept.`);
    else showMessage(`Error: ${error.message}`);
  };

  return (
    <>
      <div className="bg-blue-50 border-b border-blue-100 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h3 className="text-sm font-bold text-blue-900">{course ? `Course Attendance: ${course.course_code}` : 'Global Attendance Overview'}</h3>
          <p className="text-xs text-blue-700 font-medium">
            {course ? `Managing attendance for ${course.teacher_name}. Link a Google Sheet below.` : 'Select an Assigned Course above to manage specific course attendance.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {course ? (
            <>
              <input type="text" placeholder="Paste Google Sheet URL..." value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} className="px-3 py-1.5 border border-blue-200 rounded-md text-xs w-48 outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleSaveSheetUrl} className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-md text-xs font-bold hover:bg-blue-100 shadow-sm transition-colors">{savingId === 'sheet' ? 'Saving...' : 'Save Link'}</button>
              {course.attendance_sheet_url && <a href={course.attendance_sheet_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-emerald-500 text-white rounded-md text-xs font-bold hover:bg-emerald-600 shadow-sm flex items-center">📊 View Sheet</a>}
              <button onClick={handleEmail} disabled={isSendingEmail} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed rounded-md text-xs font-bold shadow-sm transition-colors">📧 {isSendingEmail ? 'Sending...' : 'Email to Teacher'}</button>
              <label className="px-3 py-1.5 bg-slate-800 text-white rounded-md text-xs font-bold hover:bg-slate-900 cursor-pointer shadow-sm transition-colors">⬆️ Publish CSV <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleUpload} /></label>
            </>
          ) : (
            <span className="text-xs font-bold text-blue-800 bg-blue-100 px-3 py-1.5 rounded-md border border-blue-200 shadow-sm">⚠️ Select an Assigned Course to unlock workflows</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-3 text-sm font-bold text-slate-500">College ID</th>
              <th className="p-3 text-sm font-bold text-slate-500">RU ID</th>
              <th className="p-3 text-sm font-bold text-slate-500">Name</th>
              <th className="p-3 text-sm font-bold text-slate-500">Student Contact</th>
              <th className="p-3 text-sm font-bold text-slate-500">Guardian Contact</th>
              <th className="p-3 text-sm font-bold text-slate-500 text-center">{course ? 'Course Att. (%)' : 'Global Avg (%)'}</th>
              <th className="p-3 text-sm font-bold text-slate-500 text-center">Save Record</th>
              <th className="p-3 text-sm font-bold text-purple-600 text-center">Eligibility Override</th>
              <th className="p-3 text-sm font-bold text-slate-500 text-center">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student) => {
              const courseAtt = attendance[student.id] ?? 0;
              const globalAtt = student.attendance_percentage || 0;
              return (
                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-sm font-medium text-slate-900">{student.college_id}</td>
                  <td className="p-3 text-sm text-slate-500">{student.ru_id || 'N/A'}</td>
                  <td className="p-3 text-sm font-medium text-slate-700">{student.name}</td>
                  <td className="p-3 text-sm text-slate-500">{student.student_contact || '-'}</td>
                  <td className="p-3 text-sm text-slate-500">{student.guardian_contact || '-'}</td>
                  <td className="p-3 text-sm text-center">
                    {course ? (
                      <input
                        type="number" min="0" max="100" value={courseAtt}
                        onChange={(e) => setAttendance({ ...attendance, [student.id]: parseInt(e.target.value) || 0 })}
                        className={`w-20 border rounded-lg p-1.5 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 ${courseAtt < MIN_ATTENDANCE_PERCENT ? 'border-rose-300 text-rose-600 bg-rose-50' : 'border-slate-300 text-slate-900'}`}
                      />
                    ) : (
                      <span className={`font-bold ${globalAtt < MIN_ATTENDANCE_PERCENT ? 'text-rose-600' : 'text-emerald-600'}`}>{globalAtt}% (Avg)</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-center">
                    {course ? (
                      <button onClick={() => handleSaveAttendance(student.id)} disabled={savingId === student.id} className="px-3 py-1 bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-bold hover:bg-blue-200 transition-colors">
                        {savingId === student.id ? '...' : 'Save Att.'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">Select a Course</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-center">
                    <button onClick={() => handleToggleOverride(student)} className={`px-3 py-1 border rounded text-xs font-bold transition-colors ${student.eligibility_override ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}>
                      {student.eligibility_override ? 'OVERRIDE: ON' : 'Override: OFF'}
                    </button>
                  </td>
                  <td className="p-3 text-sm text-center">
                    <button onClick={() => onEditStudent(student)} className="text-indigo-600 hover:text-indigo-800 font-bold text-xs mx-2">Edit</button>
                    <button onClick={() => handleSetLogin(student)} className="text-emerald-600 hover:text-emerald-800 font-bold text-xs mx-2">Set Login</button>
                    <button onClick={() => handleDelete(student)} className="text-rose-600 hover:text-rose-800 font-bold text-xs mx-2">Delete</button>
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-slate-500 font-medium bg-slate-50/50">No students found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
