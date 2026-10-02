import type { AcademicOpening, CourseResult, SemesterResult } from './types';

// UGC uniform grading scale — must match the generated column in 004_course_results.sql.
export const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0, A: 3.75, 'A-': 3.5, 'B+': 3.25, B: 3.0, 'B-': 2.75, 'C+': 2.5, C: 2.25, D: 2.0, F: 0,
};
export const GRADES = Object.keys(GRADE_POINTS);

// Same identifier the database uses to tell exams (regular / retake / improvement) apart.
export const examKey = (title?: string | null) => (title ?? '').trim().toLowerCase();

// Department rules (mirrors refresh_academic_standing in 007_cumulative_cgpa.sql):
// * an F counts as 0.00 until a better attempt replaces it,
// * for each course the BEST attempt counts,
// * an optional starting point covers semesters 1..N that were never uploaded.
export function bestAttempts(results: CourseResult[]) {
  const best = new Map<string, CourseResult>();
  results.forEach((r) => {
    const current = best.get(r.course_code);
    if (
      !current ||
      Number(r.grade_point) > Number(current.grade_point) ||
      (Number(r.grade_point) === Number(current.grade_point) && r.semester > current.semester)
    ) best.set(r.course_code, r);
  });
  return best;
}

export type Standing = { cgpa: number; creditsEarned: number; creditsCounted: number; backlogs: string[] };

// Standing after a given semester (or overall when throughSemester is omitted).
export function standingThrough(results: CourseResult[], opening?: AcademicOpening | null, throughSemester = 99): Standing {
  const openingApplies = opening && opening.through_semester <= throughSemester;
  const counted = results.filter((r) => r.semester <= throughSemester && r.semester > (opening?.through_semester ?? 0));
  const best = [...bestAttempts(counted).values()];
  const points = best.reduce((sum, r) => sum + Number(r.grade_point) * Number(r.credit), 0) + (openingApplies ? Number(opening.cgpa) * Number(opening.credits) : 0);
  const credits = best.reduce((sum, r) => sum + Number(r.credit), 0) + (openingApplies ? Number(opening.credits) : 0);
  return {
    cgpa: credits ? points / credits : 0,
    creditsCounted: credits,
    creditsEarned: best.filter((r) => r.grade !== 'F').reduce((sum, r) => sum + Number(r.credit), 0) + (openingApplies ? Number(opening.credits) : 0),
    backlogs: best.filter((r) => r.grade === 'F').map((r) => r.course_code),
  };
}

// Kept for callers that only need the overall figures.
export const academicStanding = (results: CourseResult[], opening?: AcademicOpening | null) => standingThrough(results, opening);

const weighted = (rows: Pick<CourseResult, 'grade_point' | 'credit'>[]) => {
  const credits = rows.reduce((sum, r) => sum + Number(r.credit), 0);
  return credits ? rows.reduce((sum, r) => sum + Number(r.grade_point) * Number(r.credit), 0) / credits : 0;
};

export type SemesterSummary = {
  semester: number;
  gpa: number; // RU's official GPA when published, otherwise calculated from the regular attempt
  credits: number;
  earned: number;
  results: CourseResult[]; // every attempt that belongs to this semester
  counted: Set<string>; // ids of the attempts that count towards the CGPA
  official?: SemesterResult;
  cgpaAfter: number; // running CGPA once this semester is included
  creditsAfter: number;
};

export function semesterSummaries(results: CourseResult[], official: SemesterResult[] = [], opening?: AcademicOpening | null): SemesterSummary[] {
  const bySemester = new Map<number, CourseResult[]>();
  results.forEach((r) => bySemester.set(r.semester, [...(bySemester.get(r.semester) ?? []), r]));
  official.forEach((o) => { if (!bySemester.has(o.semester)) bySemester.set(o.semester, []); });
  const countedIds = new Set([...bestAttempts(results.filter((r) => r.semester > (opening?.through_semester ?? 0))).values()].map((r) => r.id));

  return [...bySemester]
    .sort(([a], [b]) => a - b)
    .map(([semester, rows]) => {
      // The semester's own GPA uses its first (regular) attempt at each course.
      const firstAttempts = [...new Map([...rows].sort((a, b) => a.published_at.localeCompare(b.published_at)).reverse().map((r) => [r.course_code, r])).values()];
      const sheets = official.filter((o) => o.semester === semester);
      const sheet = sheets.sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''))[0]; // the regular exam's figures
      const standing = standingThrough(results, opening, semester);
      return {
        semester,
        gpa: sheet?.gpa != null ? Number(sheet.gpa) : weighted(firstAttempts),
        credits: firstAttempts.reduce((sum, r) => sum + Number(r.credit), 0),
        earned: sheet?.earned_credits != null ? Number(sheet.earned_credits) : firstAttempts.filter((r) => r.grade !== 'F').reduce((sum, r) => sum + Number(r.credit), 0),
        results: [...rows].sort((a, b) => a.course_code.localeCompare(b.course_code) || a.published_at.localeCompare(b.published_at)),
        counted: countedIds,
        official: sheet,
        cgpaAfter: standing.cgpa,
        creditsAfter: standing.creditsEarned,
      };
    });
}

export const formatGpa = (value: number) => value.toFixed(2);
