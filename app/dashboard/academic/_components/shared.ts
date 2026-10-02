import { supabase } from '../../../../utils/supabase';
import { toCsv } from '../../../../utils/csv';
import type { Course, Student } from '../../../../utils/types';

// 2-credit courses have 3 CTs (max 10 each); 3-credit courses have 4 CTs (max 15 each).
export const ctCount = (course?: Course) => (course?.credit === 2 ? 3 : 4);

export function ctAverage(marks: { ct1?: number; ct2?: number; ct3?: number; ct4?: number }, course?: Course) {
  const count = ctCount(course);
  const total = (marks.ct1 || 0) + (marks.ct2 || 0) + (marks.ct3 || 0) + (count === 4 ? marks.ct4 || 0 : 0);
  return (total / count).toFixed(1);
}

// CSV columns: College ID, RU ID, Name, then CT1..CT3/CT4. Uploads read the same layout.
export function gradingSheetCsv(students: Student[], course: Course) {
  const cts = Array.from({ length: ctCount(course) }, (_, i) => `CT${i + 1}`);
  return toCsv(
    ['College ID', 'RU ID', 'Name', ...cts],
    students.map((s) => [s.college_id, s.ru_id || 'N/A', s.name, ...cts.map(() => 0)]),
  );
}

// CSV columns: College ID, RU ID, Name, Total Classes Held, Classes Attended.
export function attendanceSheetCsv(students: Student[]) {
  return toCsv(
    ['College ID', 'RU ID', 'Name', 'Total Classes Held', 'Classes Attended'],
    students.map((s) => [s.college_id, s.ru_id || 'N/A', s.name, 0, 0]),
  );
}

// A student's overall attendance is the average of their per-course attendance.
export async function refreshGlobalAttendance(studentIds: string[]) {
  if (studentIds.length === 0) return;
  const { data } = await supabase.from('ct_marks').select('student_id, course_attendance').in('student_id', studentIds);
  if (!data) return;

  const byStudent = new Map<string, number[]>();
  data.forEach((row) => {
    const list = byStudent.get(row.student_id) ?? [];
    list.push(Number(row.course_attendance) || 0);
    byStudent.set(row.student_id, list);
  });

  await Promise.all(
    [...byStudent].map(([id, values]) =>
      supabase
        .from('master_students')
        .update({ attendance_percentage: Math.round(values.reduce((a, b) => a + b, 0) / values.length) })
        .eq('id', id),
    ),
  );
}

export async function emailRoster(course: Course, type: 'ct_marks' | 'attendance', csvData: string) {
  const response = await fetch('/api/academic/send-roster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherEmail: course.teacher_email,
      teacherName: course.teacher_name,
      courseCode: course.course_code,
      courseName: course.course_name,
      type,
      csvData,
      sheetUrl: type === 'attendance' ? course.attendance_sheet_url : null,
    }),
  });
  return response.ok;
}

export const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
