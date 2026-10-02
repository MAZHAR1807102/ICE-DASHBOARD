import { supabase } from '../../../utils/supabase';
import type { Course, CourseResult, CtMark, FinanceTransaction, Notice, Student } from '../../../utils/types';

export type Profile = {
  student: Student;
  courses: Course[]; // the student's current semester
  marks: Record<string, CtMark>; // by course code
  results: CourseResult[];
  transactions: FinanceTransaction[];
  notices: Notice[];
};

// Everything on the profile, read as the signed-in student (RLS limits each query to their own rows).
export async function loadProfile(studentId: string): Promise<Profile | null> {
  const { data: student } = await supabase.from('master_students').select('*').eq('id', studentId).single<Student>();
  if (!student) return null;

  const [courses, marks, results, transactions, notices] = await Promise.all([
    supabase.from('courses').select('*').eq('semester', student.semester).order('course_code'),
    supabase.from('ct_marks').select('*').eq('student_id', studentId),
    supabase.from('course_results').select('*').eq('student_id', studentId).order('semester'),
    supabase.from('finance_transactions').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    supabase.from('department_notices').select('*').order('created_at', { ascending: false }),
  ]);

  return {
    student,
    courses: (courses.data ?? []) as Course[],
    marks: Object.fromEntries(((marks.data ?? []) as CtMark[]).map((m) => [m.course_code, m])),
    results: (results.data ?? []) as CourseResult[],
    transactions: (transactions.data ?? []) as FinanceTransaction[],
    notices: (notices.data ?? []) as Notice[],
  };
}
