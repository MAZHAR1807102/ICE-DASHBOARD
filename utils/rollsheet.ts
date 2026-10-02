// Builds the contents of an RU exam roll sheet: who sits the exam and which subjects each takes.
import { bestAttempts } from './grades';
import { classifyCohorts, type Cohort } from './cohort';
import type { CourseResult, Student } from './types';

export type RollSubject = { course_code: string; title: string; credit: number | null; is_theory: boolean; position: number };
export type RollGroup = Cohort | 'backlog';
export type RollEntry = {
  student: Pick<Student, 'id' | 'name' | 'ru_id' | 'college_id' | 'semester'> & {
    name_bn?: string | null; mother_name?: string | null; father_name?: string | null; session?: string | null;
  };
  group: RollGroup;
  subjects: string[]; // course codes this student sits
};

// RU convention: a course code ending in an odd digit is theory, even is sessional/lab (…80 = viva).
export const isTheoryCode = (code: string) => Number(code.replace(/\D/g, '').slice(-1)) % 2 === 1;

// 2538520101 → "2024-25" (the RU ID starts with the year the session ends).
export function sessionOf(student: { ru_id: string | null; session?: string | null }) {
  if (student.session?.trim()) return student.session.trim();
  const yy = Number((student.ru_id ?? '').slice(0, 2));
  return yy ? `20${String(yy - 1).padStart(2, '0')}-${String(yy).padStart(2, '0')}` : '';
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];
// Semester 3 → "2nd Year 1st Semester"
export const semesterTitle = (semester: number) => `${ORDINAL[Math.ceil(semester / 2) - 1]} Year ${ORDINAL[(semester - 1) % 2]} Semester`;

// Theory marks per credit on the sheet (17.5 in years 1–3, 20 in year 4 on the department's sheets).
export const defaultMarksPerCredit = (semester: number) => (semester >= 7 ? 20 : 17.5);

const rollKey = (s: { ru_id: string | null; college_id: string }) => (s.ru_id ?? '').replace(/\D/g, '') || `~${s.college_id}`;

// Regular and Readd students of the semester sit every subject; students from later semesters
// sit the subjects of this semester whose best grade is still F (backlogs).
export function buildRollEntries(semester: number, subjects: RollSubject[], students: RollEntry['student'][], results: CourseResult[]): RollEntry[] {
  const codes = subjects.map((s) => s.course_code);
  const cohorts = classifyCohorts(students);
  const resultsByStudent = new Map<string, CourseResult[]>();
  results.forEach((r) => resultsByStudent.set(r.student_id, [...(resultsByStudent.get(r.student_id) ?? []), r]));

  const entries: RollEntry[] = [];
  students.forEach((s) => {
    if (s.semester === semester) {
      entries.push({ student: s, group: cohorts.get(s.id) ?? 'regular', subjects: [...codes] });
      return;
    }
    if (s.semester < semester) return;
    const best = bestAttempts((resultsByStudent.get(s.id) ?? []).filter((r) => codes.includes(r.course_code)));
    const backlogs = codes.filter((c) => best.get(c)?.grade === 'F');
    if (backlogs.length) entries.push({ student: s, group: 'backlog', subjects: backlogs });
  });

  // RU's order: the regular batch first; then older batches newest-first (24… before 23…),
  // readd before backlog within a batch, ascending roll within each.
  const batch = (e: RollEntry) => Number((e.student.ru_id ?? '').slice(0, 2)) || 0;
  return entries.sort((a, b) =>
    (a.group === 'regular' ? 0 : 1) - (b.group === 'regular' ? 0 : 1) ||
    batch(b) - batch(a) ||
    (a.group === 'readd' ? 0 : 1) - (b.group === 'readd' ? 0 : 1) ||
    rollKey(a.student).localeCompare(rollKey(b.student), undefined, { numeric: true }));
}
