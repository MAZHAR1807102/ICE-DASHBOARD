import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicOpening, Course, CourseResult, CtMark, FinanceTransaction, Notice, SemesterResult, Student } from './types';

export type Profile = {
  student: Student;
  courses: Course[]; // the student's current semester
  marks: Record<string, CtMark>; // by course code
  results: CourseResult[];
  official: SemesterResult[]; // RU's published GPA / YGPA / result / merit per semester
  opening: AcademicOpening | null; // starting CGPA for semesters never uploaded
  transactions: FinanceTransaction[];
  notices: Notice[];
};

// Everything on a student's profile. The student portal reads it as the signed-in student (RLS limits
// each query to their own rows); the staff "view as student" route reads the same queries server-side.
export async function fetchProfile(client: SupabaseClient, studentId: string): Promise<Profile | null> {
  const { data: student } = await client.from('master_students').select('*').eq('id', studentId).single<Student>();
  if (!student) return null;

  const [courses, marks, results, transactions, notices, official, opening] = await Promise.all([
    client.from('courses').select('*').eq('semester', student.semester).order('course_code'),
    client.from('ct_marks').select('*').eq('student_id', studentId),
    client.from('course_results').select('*').eq('student_id', studentId).order('semester'),
    client.from('finance_transactions').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    client.from('department_notices').select('*').order('created_at', { ascending: false }),
    client.from('semester_results').select('*').eq('student_id', studentId).order('semester'),
    client.from('academic_opening').select('*').eq('student_id', studentId).maybeSingle(),
  ]);

  return {
    student,
    courses: (courses.data ?? []) as Course[],
    marks: Object.fromEntries(((marks.data ?? []) as CtMark[]).map((m) => [m.course_code, m])),
    results: (results.data ?? []) as CourseResult[],
    official: (official.data ?? []) as SemesterResult[],
    opening: (opening.data as AcademicOpening | null) ?? null,
    transactions: (transactions.data ?? []) as FinanceTransaction[],
    notices: (notices.data ?? []) as Notice[],
  };
}
