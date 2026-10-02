import type { CourseResult, SemesterResult } from './types';

// UGC uniform grading scale — must match the generated column in 004_course_results.sql.
export const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0, A: 3.75, 'A-': 3.5, 'B+': 3.25, B: 3.0, 'B-': 2.75, 'C+': 2.5, C: 2.25, D: 2.0, F: 0,
};
export const GRADES = Object.keys(GRADE_POINTS);

const weighted = (rows: Pick<CourseResult, 'grade_point' | 'credit'>[]) => {
  const credits = rows.reduce((sum, r) => sum + Number(r.credit), 0);
  return credits ? rows.reduce((sum, r) => sum + Number(r.grade_point) * Number(r.credit), 0) / credits : 0;
};

// Each course's most recent attempt — a retake replaces the earlier grade.
export function latestAttempts(results: CourseResult[]) {
  const latest = new Map<string, CourseResult>();
  results.forEach((r) => {
    const current = latest.get(r.course_code);
    if (!current || r.semester > current.semester) latest.set(r.course_code, r);
  });
  return [...latest.values()];
}

export type SemesterSummary = {
  semester: number;
  gpa: number; // RU's official GPA when published, otherwise calculated from the grades
  credits: number;
  earned: number;
  results: CourseResult[];
  official?: SemesterResult;
};

export function semesterSummaries(results: CourseResult[], official: SemesterResult[] = []): SemesterSummary[] {
  const bySemester = new Map<number, CourseResult[]>();
  results.forEach((r) => bySemester.set(r.semester, [...(bySemester.get(r.semester) ?? []), r]));
  official.forEach((o) => { if (!bySemester.has(o.semester)) bySemester.set(o.semester, []); });
  return [...bySemester]
    .sort(([a], [b]) => a - b)
    .map(([semester, rows]) => {
      const sheet = official.find((o) => o.semester === semester);
      return {
        semester,
        gpa: sheet?.gpa !== null && sheet?.gpa !== undefined ? Number(sheet.gpa) : weighted(rows),
        credits: rows.reduce((sum, r) => sum + Number(r.credit), 0),
        earned: sheet?.earned_credits !== null && sheet?.earned_credits !== undefined
          ? Number(sheet.earned_credits)
          : rows.filter((r) => r.grade !== 'F').reduce((sum, r) => sum + Number(r.credit), 0),
        results: [...rows].sort((a, b) => a.course_code.localeCompare(b.course_code)),
        official: sheet,
      };
    });
}

export function academicStanding(results: CourseResult[]) {
  const latest = latestAttempts(results);
  return {
    cgpa: weighted(latest),
    creditsEarned: latest.filter((r) => r.grade !== 'F').reduce((sum, r) => sum + Number(r.credit), 0),
    backlogs: latest.filter((r) => r.grade === 'F').map((r) => r.course_code),
  };
}

export const formatGpa = (value: number) => value.toFixed(2);
