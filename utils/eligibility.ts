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
