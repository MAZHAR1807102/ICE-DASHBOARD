import type { Course } from './types';

// 2-credit courses have 3 CTs (max 10 each); 3-credit courses have 4 CTs (max 15 each).
export const ctCount = (course?: Pick<Course, 'credit'>) => (course?.credit === 2 ? 3 : 4);
export const ctMax = (course?: Pick<Course, 'credit'>) => (course?.credit === 2 ? 10 : 15);

export function ctAverage(marks: { ct1?: number | null; ct2?: number | null; ct3?: number | null; ct4?: number | null }, course?: Pick<Course, 'credit'>) {
  const count = ctCount(course);
  const total = Number(marks.ct1 || 0) + Number(marks.ct2 || 0) + Number(marks.ct3 || 0) + (count === 4 ? Number(marks.ct4 || 0) : 0);
  return (total / count).toFixed(1);
}
