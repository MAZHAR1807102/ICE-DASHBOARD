'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { classifyCohorts, matchesCohort, orderByCohort, type CohortFilter } from '../../../utils/cohort';
import { BookOpen, ClipboardList, Megaphone, UserPlus, UsersRound } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { SEMESTERS, type Course, type CtMark, type Notice, type Student } from '../../../utils/types';
import { Button, Card, CohortSelect, PageHeader, Tabs, inputClass } from '../../components/ui';
import { useToast } from '../../components/Providers';
import RosterTab from './_components/RosterTab';
import CtMarksTab from './_components/CtMarksTab';
import CurriculumTab from './_components/CurriculumTab';
import NoticesTab from './_components/NoticesTab';
import StudentModal from './_components/StudentModal';

type Tab = 'roster' | 'ct_marks' | 'curriculum' | 'notices';

export default function AcademicDashboard() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [marks, setMarks] = useState<{ course: string; rows: Record<string, CtMark> }>({ course: '', rows: {} });
  const [version, setVersion] = useState(0); // bumps on every reload so tabs reset their unsaved edits

  const [activeTab, setActiveTab] = useState<Tab>('roster');
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [selectedCourseCode, setSelectedCourseCode] = useState('');
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>('all');
  const [studentModal, setStudentModal] = useState<{ student?: Student } | null>(null);

  const loadData = useCallback(() =>
    Promise.all([
      supabase.from('master_students').select('*').order('ru_id', { ascending: false }),
      supabase.from('courses').select('*').order('semester', { ascending: true }),
      supabase.from('department_notices').select('*').order('created_at', { ascending: false }),
    ]).then(([studentRes, courseRes, noticeRes]) => {
      if (studentRes.data) setStudents(studentRes.data as Student[]);
      if (courseRes.data) setCourses(courseRes.data as Course[]);
      if (noticeRes.data) setNotices(noticeRes.data as Notice[]);
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
        actions={<Button icon={UserPlus} onClick={() => setStudentModal({})}>Add student</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'roster', label: 'Roster & Attendance', icon: UsersRound },
            { id: 'ct_marks', label: 'CT Marks', icon: ClipboardList },
            { id: 'curriculum', label: 'Curriculum', icon: BookOpen },
            { id: 'notices', label: 'Broadcasts', icon: Megaphone, count: notices.length },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedSemester}
            onChange={(e) => { setSelectedSemester(e.target.value); setSelectedCourseCode(''); }}
            className={`${inputClass} sm:w-44`}
            aria-label="Semester"
          >
            <option value="All">All semesters</option>
            {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
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
              {displayedCourses.map((c) => <option key={c.course_code} value={c.course_code}>{c.course_code} — {c.course_name}</option>)}
            </select>
          )}
        </div>
      </div>

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
            selectedSemester={selectedSemester}
            onChanged={reload}
            showMessage={showMessage}
            onCourseDeleted={(code) => { if (code === selectedCourseCode) setSelectedCourseCode(''); }}
          />
        )}
        {activeTab === 'notices' && <NoticesTab notices={notices} onChanged={reload} showMessage={showMessage} />}
      </Card>

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
