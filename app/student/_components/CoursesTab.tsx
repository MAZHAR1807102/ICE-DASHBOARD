import { ctAverage, ctCount, ctMax } from '../../../utils/ct';
import type { Course, CtMark } from '../../../utils/types';
import { BookOpen } from 'lucide-react';
import { AttendanceBar, Card, EmptyState } from './ui';

export default function CoursesTab({ semester, courses, marks }: {
  semester: number;
  courses: Course[];
  marks: Record<string, CtMark>;
}) {
  const totalCredits = courses.reduce((sum, c) => sum + Number(c.credit), 0);

  if (courses.length === 0) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="No courses yet" body={`Courses for semester ${semester} haven't been added by the academic office yet.`} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <p className="text-sm text-slate-600">
          <span className="font-bold text-slate-900">{courses.length} courses</span> enrolled in semester {semester} ·{' '}
          <span className="font-bold text-slate-900">{totalCredits} credits</span> in progress
        </p>
        <p className="text-xs text-slate-500">CT max: 15 per test (3-credit) · 10 per test (2-credit)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {courses.map((course) => {
          const m = marks[course.course_code];
          const attendance = Number(m?.course_attendance) || 0;
          const count = ctCount(course);
          const tests = [m?.ct1, m?.ct2, m?.ct3, m?.ct4].slice(0, count).map((v) => Number(v) || 0);
          return (
            <Card key={course.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-indigo-600">{course.course_code}</p>
                  <h3 className="font-bold text-slate-900 leading-snug">{course.course_name}</h3>
                  {course.teacher_name && <p className="text-xs text-slate-500 mt-0.5">{course.teacher_name}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{course.credit} cr</span>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs font-medium text-slate-500 mb-1.5">
                  <span>Attendance</span>
                  <span className="font-bold text-slate-800">{attendance}%</span>
                </div>
                <AttendanceBar percent={attendance} />
              </div>

              <div className="mt-4 flex items-end gap-2">
                {tests.map((score, i) => (
                  <div key={i} className="flex-1 rounded-lg bg-slate-50 border border-slate-100 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CT {i + 1}</p>
                    <p className="text-sm font-bold text-slate-800">{score || '–'}<span className="text-[10px] font-medium text-slate-400">/{ctMax(course)}</span></p>
                  </div>
                ))}
                <div className="flex-1 rounded-lg bg-indigo-50 border border-indigo-100 py-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Avg</p>
                  <p className="text-sm font-black text-indigo-700">{ctAverage(m ?? {}, course)}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
