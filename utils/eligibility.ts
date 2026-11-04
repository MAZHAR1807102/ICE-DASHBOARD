// The department's exam eligibility rule — used by the exam office check and the student portal.

export const MIN_ATTENDANCE_PERCENT = 60;

export function isExamEligible(student: {
  attendance_percentage: number | null;
  total_due: number;
  eligibility_override: boolean | null;
}) {
  if (student.eligibility_override) return true; // Manually approved by the academic coordinator
  return (student.attendance_percentage ?? 0) >= MIN_ATTENDANCE_PERCENT && student.total_due <= 0;
}

// What the student portal shows. Attendance that has not been entered yet is not a reason to
// call a student "blocked": they are "waiting" until a teacher records it (dues still block).
export type ExamStatus = 'eligible' | 'blocked' | 'waiting';
export function studentExamStatus(student: Parameters<typeof isExamEligible>[0], attendanceRecorded: boolean): ExamStatus {
  if (isExamEligible(student)) return 'eligible';
  if (student.total_due > 0) return 'blocked';
  return attendanceRecorded ? 'blocked' : 'waiting';
}

// Attendance counts as recorded once the student has an overall figure or any course figure above 0.
export const attendanceRecorded = (overall: number | null | undefined, perCourse: (number | null | undefined)[]) =>
  Number(overall) > 0 || perCourse.some((p) => Number(p) > 0);
