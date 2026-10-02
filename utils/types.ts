// Shapes of the database rows the app works with.

export type Student = {
  id: string;
  college_id: string;
  ru_id: string | null;
  name: string;
  semester: number;
  advisor: string | null;
  attendance_percentage: number | null;
  internal_marks_status: string | null;
  exam_reg_status: string | null;
  backlogs: number | null;
  student_contact: string | null;
  guardian_contact: string | null;
  eligibility_override: boolean | null;
  // Contract rates
  agreed_monthly_fee: number | null;
  agreed_semester_fee: number | null;
  agreed_ru_exam_fee: number | null;
  // Balances — maintained by the finance ledger, read-only for the app
  monthly_due: number | null;
  semester_due: number | null;
  exam_due: number | null;
  attendance_fine: number | null;
  total_fines_paid: number | null;
  // Academic standing — maintained by the database from published results (migration 007)
  cgpa?: number | null;
  credits_earned?: number | null;
  // Printed on RU roll sheets (migration 010)
  name_bn?: string | null;
  mother_name?: string | null;
  father_name?: string | null;
  session?: string | null; // blank = worked out from the RU ID
};

export type Course = {
  id: string;
  semester: number;
  course_code: string;
  course_name: string;
  credit: number;
  teacher_name: string | null;
  teacher_email: string | null;
  attendance_sheet_url: string | null;
  ct_saved_at?: string | null; // set when the course teacher saves CT marks (migration 005)
  ct_saved_by?: string | null;
};

export type CtMark = {
  student_id: string;
  course_code: string;
  ct1: number | null;
  ct2: number | null;
  ct3: number | null;
  ct4: number | null;
  course_attendance: number | null;
};

export type Notice = {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  posted_by: string | null;
  created_at: string;
};

export type FeeCategory = 'monthly' | 'semester' | 'ru_exam' | 'fine';

export type FinanceTransaction = {
  id: string;
  category: FeeCategory;
  kind: 'charge' | 'payment' | 'adjustment';
  amount: number;
  semester: number;
  is_opening: boolean;
  receipt_id: string | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
};

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export const totalDue = (s: Pick<Student, 'monthly_due' | 'semester_due' | 'exam_due' | 'attendance_fine'>) =>
  (s.monthly_due || 0) + (s.semester_due || 0) + (s.exam_due || 0) + (s.attendance_fine || 0);

export type CourseResult = {
  id: string;
  student_id: string;
  semester: number;
  course_code: string;
  course_name: string | null;
  credit: number;
  grade: string;
  grade_point: number;
  exam_key: string; // which exam this attempt came from; '' for manual/template entries
  published_at: string;
};

// Figures RU publishes per student and semester (migration 006).
export type SemesterResult = {
  semester: number;
  exam_title: string | null;
  earned_credits: number | null;
  gpa: number | null;
  year_earned_credits: number | null;
  ygpa: number | null;
  result_status: string | null;
  merit_position: number | null;
  exam_key?: string;
  published_at?: string;
};

// Starting point for semesters published before the system existed (migration 007).
export type AcademicOpening = {
  student_id: string;
  through_semester: number;
  credits: number;
  cgpa: number;
  note: string | null;
};

export const DEGREE_CREDITS = 160;
