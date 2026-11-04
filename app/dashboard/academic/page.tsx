'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { classifyCohorts, matchesCohort, orderByCohort, type CohortFilter } from '../../../utils/cohort';
import { ArrowUpCircle, BookOpen, CalendarCheck, ClipboardList, GraduationCap, FileInput, Megaphone, UserPlus, UsersRound } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { SEMESTERS, isActive, isRunning, type Course, type CtMark, type Notice, type Student, type Teacher } from '../../../utils/types';
import { Button, Card, CohortSelect, PageHeader, SemesterChips, Tabs, inputClass } from '../../components/ui';
import { useStoredState } from '../../../utils/useStoredState';
import { useToast } from '../../components/Providers';
import RosterTab from './_components/RosterTab';
import CtMarksTab from './_components/CtMarksTab';
import CurriculumTab from './_components/CurriculumTab';
import TeachersTab from './_components/TeachersTab';
import NoticesTab from './_components/NoticesTab';
import StudentModal from './_components/StudentModal';
import ImportDetailsModal from './_components/ImportDetailsModal';
import PromoteModal from './_components/PromoteModal';
import AttendanceSheetModal from './_components/AttendanceSheetModal';

type Tab = 'roster' | 'ct_marks' | 'curriculum' | 'teachers' | 'notices';

export default function AcademicDashboard() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [marks, setMarks] = useState<{ course: string; rows: Record<string, CtMark> }>({ course: '', rows: {} });
  const [version, setVersion] = useState(0); // bumps on every reload so tabs reset their unsaved edits

  const [activeTab, setActiveTab] = useState<Tab>('roster');
  const [selectedSemester, setSelectedSemesterRaw] = useStoredState<string>('academic.semester', 'All');
  const [selectedCourseCode, setSelectedCourseCode] = useState('');
  const [cohortFilter, setCohortFilter] = useStoredState<CohortFilter>('academic.cohort', 'all', ['all', 'regular', 'readd']);
  const [studentModal, setStudentModal] = useState<{ student?: Student } | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);
  const [isAttendanceSheetOpen, setIsAttendanceSheetOpen] = useState(false);

  // A new semester means a new course list, so the chosen course is cleared.
  const setSelectedSemester = (value: string) => { setSelectedSemesterRaw(value); setSelectedCourseCode(''); };
  const semesterCounts = students.reduce<Record<number, number>>((m, s) => ({ ...m, [s.semester]: (m[s.semester] ?? 0) + 1 }), {});

  const loadData = useCallback(() =>
    Promise.all([
      supabase.from('master_students').select('*').order('ru_id', { ascending: false }),
      supabase.from('courses').select('*').order('semester', { ascending: true }),
      supabase.from('department_notices').select('*').order('created_at', { ascending: false }),
      supabase.from('teachers').select('*').order('name'),
    ]).then(([studentRes, courseRes, noticeRes, teacherRes]) => {
      if (studentRes.data) setStudents((studentRes.data as Student[]).filter(isActive));
      if (courseRes.data) setCourses(courseRes.data as Course[]);
      if (noticeRes.data) setNotices(noticeRes.data as Notice[]);
      if (teacherRes.data) setTeachers(teacherRes.data as Teacher[]);
      setVersion((v) => v + 1);
    }), []);

  const loadMarks = useCallback((courseCode: string) =>
    supabase.from('ct_marks').select('*').eq('course_code', courseCode).then(({ data }) => {
      setMarks({ course: courseCode, rows: Object.fromEntries((data ?? []).map((m: CtMark) => [m.student_id, m])) });
      setVersion((v) => v + 1);
    }), []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedCourseCode) loadMarks(selectedCourseCode);
  }, [selectedCourseCode, loadMarks]);

  const reload = () => {
    loadData();
    if (selectedCourseCode) loadMarks(selectedCourseCode);
  };

  const showMessage = (msg: string) => (/^(error|⚠️|❌)/i.test(msg) ? toast.error(msg) : toast.success(msg));

  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const displayedStudents = useMemo(() => orderByCohort(
    students.filter((s) => (selectedSemester === 'All' || s.semester.toString() === selectedSemester) && matchesCohort(cohortFilter, cohorts.get(s.id))),
    cohorts,
  ), [students, selectedSemester, cohortFilter, cohorts]);
  const displayedCourses = selectedSemester === 'All' ? courses : courses.filter((c) => c.semester.toString() === selectedSemester);
  const currentCourse = courses.find((c) => c.course_code === selectedCourseCode);
  const courseMarks = marks.course === selectedCourseCode ? marks.rows : {};
  const tabKey = `${selectedSemester}:${selectedCourseCode}:${cohortFilter}:${version}`;
  const needsCourse = activeTab === 'ct_marks' || activeTab === 'roster';

  return (
    <>
      <PageHeader
        title="Academic Coordination"
        description="Students, courses, attendance, CT marks and notices."
        actions={<>
          <Button variant="secondary" icon={CalendarCheck} onClick={() => setIsAttendanceSheetOpen(true)}>Attendance sheet</Button>
          <Button variant="secondary" icon={ArrowUpCircle} onClick={() => setIsPromoteOpen(true)}>Promote students</Button>
          <Button variant="secondary" icon={FileInput} onClick={() => setIsImportOpen(true)}>Import details</Button>
          <Button icon={UserPlus} onClick={() => setStudentModal({})}>Add student</Button>
        </>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'roster', label: 'Roster & Attendance', icon: UsersRound },
            { id: 'ct_marks', label: 'CT Marks', icon: ClipboardList },
            { id: 'curriculum', label: 'Curriculum', icon: BookOpen },
            { id: 'teachers', label: 'Teachers', icon: GraduationCap, count: teachers.length },
            { id: 'notices', label: 'Broadcasts', icon: Megaphone, count: notices.length },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {needsCourse && <CohortSelect value={cohortFilter} onChange={setCohortFilter} className="sm:w-44" />}
          {needsCourse && (
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              disabled={selectedSemester === 'All'}
              className={`${inputClass} sm:w-56`}
              aria-label="Course"
            >
              <option value="">{selectedSemester === 'All' ? 'Pick a semester first' : 'Select a course'}</option>
              {displayedCourses.filter(isRunning).map((c) => <option key={c.course_code} value={c.course_code}>{c.course_code} — {c.course_name}</option>)}
            </select>
          )}
        </div>
      </div>

      {activeTab !== 'teachers' && activeTab !== 'notices' && (
        <SemesterChips value={selectedSemester} onChange={setSelectedSemester} counts={semesterCounts} always={activeTab === 'curriculum' ? [...SEMESTERS] : undefined} className="mb-4" />
      )}

      <Card className="overflow-hidden">
        {activeTab === 'roster' && (
          <RosterTab
            key={tabKey}
            students={displayedStudents}
            cohorts={cohorts}
            showSemester={selectedSemester === 'All'}
            course={currentCourse}
            marks={courseMarks}
            onChanged={reload}
            showMessage={showMessage}
            onEditStudent={(student) => setStudentModal({ student })}
          />
        )}
        {activeTab === 'ct_marks' && (
          <CtMarksTab key={tabKey} students={displayedStudents} cohorts={cohorts} course={currentCourse} marks={courseMarks} onChanged={reload} showMessage={showMessage} />
        )}
        {activeTab === 'curriculum' && (
          <CurriculumTab
            key={selectedSemester}
            courses={displayedCourses}
            students={students}
            teachers={teachers}
            selectedSemester={selectedSemester}
            onChanged={reload}
            showMessage={showMessage}
            onCourseDeleted={(code) => { if (code === selectedCourseCode) setSelectedCourseCode(''); }}
          />
        )}
        {activeTab === 'teachers' && <TeachersTab teachers={teachers} courses={courses} onChanged={reload} showMessage={showMessage} />}
        {activeTab === 'notices' && <NoticesTab notices={notices} onChanged={reload} showMessage={showMessage} />}
      </Card>

      {isImportOpen && (
        <ImportDetailsModal students={students} onClose={() => setIsImportOpen(false)} onSaved={(msg) => { showMessage(msg); setIsImportOpen(false); reload(); }} />
      )}
      {isPromoteOpen && (
        <PromoteModal students={students} onClose={() => setIsPromoteOpen(false)} onSaved={(msg) => { showMessage(msg); setIsPromoteOpen(false); reload(); }} />
      )}
      {isAttendanceSheetOpen && (
        <AttendanceSheetModal
          students={students}
          courses={courses}
          initialSemester={parseInt(selectedSemester) || 1}
          onClose={() => setIsAttendanceSheetOpen(false)}
        />
      )}
      {studentModal && (
        <StudentModal
          student={studentModal.student}
          defaultSemester={parseInt(selectedSemester) || 1}
          onClose={() => setStudentModal(null)}
          onSaved={(msg) => { showMessage(msg); setStudentModal(null); reload(); }}
        />
      )}
    </>
  );
}
