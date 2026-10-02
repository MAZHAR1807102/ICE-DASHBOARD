'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { SEMESTERS, type Course, type CtMark, type Notice, type Student } from '../../../utils/types';
import PortalHeader from '../../components/PortalHeader';
import RosterTab from './_components/RosterTab';
import CtMarksTab from './_components/CtMarksTab';
import CurriculumTab from './_components/CurriculumTab';
import NoticesTab from './_components/NoticesTab';
import StudentModal from './_components/StudentModal';

type Tab = 'roster' | 'ct_marks' | 'curriculum' | 'notices';

const TABS: { id: Tab; label: string; active: string }[] = [
  { id: 'roster', label: '👥 Roster & Attendance', active: 'bg-blue-600' },
  { id: 'ct_marks', label: '📝 CT Marks Mgt', active: 'bg-indigo-600' },
  { id: 'curriculum', label: '⚙️ Curriculum & Faculty', active: 'bg-purple-600' },
  { id: 'notices', label: '📢 Broadcasts', active: 'bg-slate-800' },
];

export default function AcademicDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [marks, setMarks] = useState<{ course: string; rows: Record<string, CtMark> }>({ course: '', rows: {} });
  const [version, setVersion] = useState(0); // bumps on every reload so tabs reset their unsaved edits

  const [activeTab, setActiveTab] = useState<Tab>('roster');
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [selectedCourseCode, setSelectedCourseCode] = useState('');
  const [message, setMessage] = useState('');
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

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  const displayedStudents = selectedSemester === 'All' ? students : students.filter((s) => s.semester.toString() === selectedSemester);
  const displayedCourses = selectedSemester === 'All' ? courses : courses.filter((c) => c.semester.toString() === selectedSemester);
  const currentCourse = courses.find((c) => c.course_code === selectedCourseCode);
  const courseMarks = marks.course === selectedCourseCode ? marks.rows : {};
  const tabKey = `${selectedSemester}:${selectedCourseCode}:${version}`;

  return (
    <div className="min-h-screen bg-[#f4f7f9] p-6 lg:p-10 font-sans text-slate-800">
      <PortalHeader title="Academic Coordination" accent="indigo" />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
        {/* TOOLBAR */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${activeTab === tab.id ? `${tab.active} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {message && <p className="text-xs text-emerald-600 mt-2 font-bold bg-emerald-50 inline-block px-2 py-1 rounded">{message}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-bold text-slate-600">Batch Filter:</label>
              <select
                value={selectedSemester}
                onChange={(e) => { setSelectedSemester(e.target.value); setSelectedCourseCode(''); }}
                className="border border-slate-300 rounded-lg p-2 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="All">All Semesters</option>
                {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
              </select>
            </div>

            {(activeTab === 'ct_marks' || activeTab === 'roster') && selectedSemester !== 'All' && (
              <div className="flex items-center space-x-2 border-l border-slate-300 pl-4">
                <label className="text-sm font-bold text-indigo-700">Assigned Course:</label>
                <select
                  value={selectedCourseCode}
                  onChange={(e) => setSelectedCourseCode(e.target.value)}
                  className="border border-indigo-200 rounded-lg p-2 text-sm text-indigo-800 bg-indigo-50 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">-- Select Course --</option>
                  {displayedCourses.map((c) => <option key={c.course_code} value={c.course_code}>{c.course_code}</option>)}
                </select>
              </div>
            )}

            {activeTab === 'roster' && (
              <button onClick={() => setStudentModal({})} className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 shadow-sm ml-2">
                + Add Student
              </button>
            )}
          </div>
        </div>

        {activeTab === 'roster' && (
          <RosterTab
            key={tabKey}
            students={displayedStudents}
            course={currentCourse}
            marks={courseMarks}
            onChanged={reload}
            showMessage={showMessage}
            onEditStudent={(student) => setStudentModal({ student })}
          />
        )}
        {activeTab === 'ct_marks' && (
          <CtMarksTab key={tabKey} students={displayedStudents} course={currentCourse} marks={courseMarks} onChanged={reload} showMessage={showMessage} />
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
      </div>

      {studentModal && (
        <StudentModal
          student={studentModal.student}
          defaultSemester={parseInt(selectedSemester) || 1}
          onClose={() => setStudentModal(null)}
          onSaved={(msg) => { showMessage(msg); setStudentModal(null); reload(); }}
        />
      )}
    </div>
  );
}
