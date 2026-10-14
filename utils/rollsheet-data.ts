// Data shared by the exam-office documents (roll sheet, lab mark sheet): students, results, the
// course list, and each semester's subject list.
import { supabase } from './supabase';
import { isTheoryCode, type RollEntry, type RollSubject } from './rollsheet';
import type { Course, CourseResult } from './types';

export type SheetStudent = RollEntry['student'];
export type ExamData = { students: SheetStudent[]; results: CourseResult[]; catalog: Course[] };

async function fetchAll<T>(build: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || (data as T[]).length < 1000) return rows;
  }
}

export async function loadExamData(): Promise<ExamData> {
  const [students, results, catalog] = await Promise.all([
    fetchAll<SheetStudent>((from) => supabase.from('master_students').select('id, name, ru_id, college_id, semester, name_bn, mother_name, father_name, session').eq('status', 'active').range(from, from + 999)),
    fetchAll<CourseResult>((from) => supabase.from('course_results').select('*').range(from, from + 999)),
    supabase.from('courses').select('*'),
  ]);
  return { students, results, catalog: (catalog.data ?? []) as Course[] };
}

// The semester's saved subject list, or a starting point from the course list + published results.
export async function loadSubjectList(semester: number, { catalog, results }: Pick<ExamData, 'catalog' | 'results'>): Promise<{ subjects: RollSubject[]; saved: boolean }> {
  const { data } = await supabase.from('roll_sheet_subjects').select('*').eq('semester', semester).order('position');
  if (data && data.length) {
    return {
      saved: true,
      subjects: data.map((d) => ({ course_code: d.course_code, title: d.title, credit: d.credit === null ? null : Number(d.credit), is_theory: d.is_theory, position: d.position })),
    };
  }
  const found = new Map<string, RollSubject>();
  catalog.filter((c) => c.semester === semester).forEach((c) => {
    const code = c.course_code.toUpperCase().replace(/\s+/g, '');
    found.set(code, { course_code: code, title: c.course_name, credit: c.credit, is_theory: isTheoryCode(code), position: 0 });
  });
  results.filter((r) => r.semester === semester).forEach((r) => {
    const code = r.course_code.toUpperCase();
    if (!found.has(code)) found.set(code, { course_code: code, title: r.course_name ?? '', credit: Number(r.credit), is_theory: isTheoryCode(code), position: 0 });
  });
  // RU's usual order: non-CSE theory, then CSE theory, then labs — each by course number.
  const rank = (s: RollSubject) => (s.is_theory ? (s.course_code.startsWith('CSE') ? 1 : 0) : 2);
  const number = (s: RollSubject) => s.course_code.replace(/\D/g, '');
  return {
    saved: false,
    subjects: [...found.values()]
      .sort((a, b) => rank(a) - rank(b) || number(a).localeCompare(number(b)) || a.course_code.localeCompare(b.course_code))
      .map((s, i) => ({ ...s, position: i })),
  };
}
