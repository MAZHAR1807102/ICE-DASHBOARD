'use client';

import { useRef, useState } from 'react';
import { ExternalLink, KeyRound, Link2, Mail, Pencil, Save, ShieldCheck, Trash2, Upload, UsersRound } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { parseCsv } from '../../../../utils/csv';
import { MIN_ATTENDANCE_PERCENT } from '../../../../utils/eligibility';
import type { Course, CtMark, Student } from '../../../../utils/types';
import { Badge, Button, EmptyState, cx, inputClass, table } from '../../../components/ui';
import { useConfirm } from '../../../components/Providers';
import SetLoginModal from './SetLoginModal';
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
  const confirm = useConfirm();
  const [attendance, setAttendance] = useState<Record<string, number>>(() =>
    Object.fromEntries(students.map((s) => [s.id, Number(marks[s.id]?.course_attendance) || 0])),
  );
  const [sheetUrl, setSheetUrl] = useState(course?.attendance_sheet_url ?? '');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [loginFor, setLoginFor] = useState<Student | null>(null);
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
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage('Google Sheet link saved.');
    onChanged();
  };

  const handleEmail = async () => {
    if (!course) return;
    if (!course.teacher_email) return showMessage('Error: this course has no teacher email.');
    setIsSendingEmail(true);
    const sent = await emailRoster(course, 'attendance', attendanceSheetCsv(students)).catch(() => false);
    setIsSendingEmail(false);
    showMessage(sent ? `Attendance sheet emailed to ${course.teacher_email}.` : '⚠️ Failed to send the email.');
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
      if (error) return showMessage(`Error: upload failed — ${error.message}`);
      await refreshGlobalAttendance(updates.map((u) => u.student_id));
    }
    showMessage(`Attendance published for ${updates.length} students.`);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChanged();
  };

  const handleToggleOverride = async (student: Student) => {
    const enabled = !student.eligibility_override;
    const { error } = await supabase.from('master_students').update({ eligibility_override: enabled }).eq('id', student.id);
    if (error) return showMessage(`Error: ${error.message}`);
    showMessage(`Exam eligibility override ${enabled ? 'turned on' : 'turned off'} for ${student.name}.`);
    onChanged();
  };

  const handleDelete = async (student: Student) => {
    const ok = await confirm({ title: `Delete ${student.name}?`, body: 'This permanently removes the student record. Students with payment or marks history cannot be deleted.', confirmLabel: 'Delete student', tone: 'danger' });
    if (!ok) return;
    const { error } = await supabase.from('master_students').delete().eq('id', student.id);
    if (!error) { showMessage(`${student.name} has been deleted.`); onChanged(); }
    else if (error.code === '23503') showMessage(`Error: ${student.name} has payment or marks history and can't be deleted — those records must be kept.`);
    else showMessage(`Error: ${error.message}`);
  };

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-semibold text-slate-900">{course ? `Course Attendance: ${course.course_code}` : 'Overall attendance'}</p>
          <p className="text-sm text-slate-500">
            {course ? `${course.course_name} · ${course.teacher_name ?? 'No teacher assigned'}` : 'Pick a semester and course above to record course attendance.'}
          </p>
        </div>
        {course && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="url" placeholder="Google Sheet link" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} className={`${inputClass} h-8 w-52 pl-9 text-xs`} />
            </div>
            <Button size="sm" variant="secondary" icon={Save} loading={savingId === 'sheet'} onClick={handleSaveSheetUrl}>Save link</Button>
            {course.attendance_sheet_url && (
              <a href={course.attendance_sheet_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                <ExternalLink className="size-4" aria-hidden /> Open sheet
              </a>
            )}
            <Button size="sm" variant="secondary" icon={Mail} loading={isSendingEmail} onClick={handleEmail}>Email to teacher</Button>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800">
              <Upload className="size-4" aria-hidden /> Upload CSV
              <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleUpload} />
            </label>
          </div>
        )}
      </div>

      {students.length === 0 ? (
        <EmptyState icon={UsersRound} title="No students found" body="Add a student or choose a different semester." />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Student</th>
                <th className={table.th}>Contacts</th>
                <th className={`${table.th} text-center`}>{course ? 'Course att. %' : 'Overall att.'}</th>
                <th className={`${table.th} text-center`}>Eligibility override</th>
                <th className={`${table.th} text-right`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {students.map((student) => {
                const courseAtt = attendance[student.id] ?? 0;
                const globalAtt = student.attendance_percentage || 0;
                return (
                  <tr key={student.id} className={table.row}>
                    <td className={table.td}>
                      <p className="font-medium text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.college_id} · RU {student.ru_id || '—'} · Sem {student.semester}</p>
                    </td>
                    <td className={`${table.td} text-xs text-slate-500`}>
                      <p>{student.student_contact || '—'}</p>
                      {student.guardian_contact && <p className="text-slate-400">Guardian {student.guardian_contact}</p>}
                    </td>
                    <td className={`${table.td} text-center`}>
                      {course ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="number" min="0" max="100" value={courseAtt} aria-label={`Attendance for ${student.name}`}
                            onChange={(e) => setAttendance({ ...attendance, [student.id]: parseInt(e.target.value) || 0 })}
                            className={cx(inputClass, 'h-8 w-16 text-center font-semibold', courseAtt < MIN_ATTENDANCE_PERCENT && 'text-rose-600 ring-rose-300')}
                          />
                          <Button size="xs" variant="secondary" icon={Save} loading={savingId === student.id} onClick={() => handleSaveAttendance(student.id)} aria-label="Save attendance">Save</Button>
                        </div>
                      ) : (
                        <Badge tone={globalAtt < MIN_ATTENDANCE_PERCENT ? 'rose' : 'emerald'}>{globalAtt}%</Badge>
                      )}
                    </td>
                    <td className={`${table.td} text-center`}>
                      <button
                        onClick={() => handleToggleOverride(student)}
                        role="switch"
                        aria-checked={!!student.eligibility_override}
                        aria-label={`Eligibility override for ${student.name}`}
                        className={cx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', student.eligibility_override ? 'bg-violet-600' : 'bg-slate-200')}
                      >
                        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', student.eligibility_override ? 'translate-x-5' : 'translate-x-0.5')} />
                        {student.eligibility_override && <ShieldCheck className="sr-only" />}
                      </button>
                    </td>
                    <td className={`${table.td} text-right`}>
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="ghost" icon={Pencil} onClick={() => onEditStudent(student)}>Edit</Button>
                        <Button size="xs" variant="ghost" icon={KeyRound} onClick={() => setLoginFor(student)}>Set Login</Button>
                        <Button size="xs" variant="ghost" icon={Trash2} onClick={() => handleDelete(student)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" aria-label={`Delete ${student.name}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {loginFor && <SetLoginModal student={loginFor} onClose={() => setLoginFor(null)} onDone={(msg) => { setLoginFor(null); showMessage(msg); }} />}
    </>
  );
}
