'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';

type CourseMark = {
  course_code: string;
  course_name: string;
  credit: number;
  ct1: number;
  ct2: number;
  ct3: number;
  ct4: number;
};

export default function StudentPortal() {
  const router = useRouter();
  const [studentData, setStudentData] = useState<any>(null);
  const [courseMarks, setCourseMarks] = useState<CourseMark[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable States (Only Password remains)
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const session = localStorage.getItem('student_user');
    if (!session) {
      router.replace('/student-login');
      return;
    }
    const user = JSON.parse(session);
    fetchProfileData(user.id);
    fetchNotices();
  }, [router]);

  const fetchProfileData = async (id: string) => {
    // 1. Fetch the main student profile
    const { data: student } = await supabase.from('master_students').select('*').eq('id', id).single();
    
    if (student) {
      setStudentData(student);

      // 2. Fetch all courses for this student's specific semester
      const { data: courses } = await supabase.from('courses').select('*').eq('semester', student.semester).order('course_code', { ascending: true });
      
      // 3. Fetch all recorded CT marks for this specific student
      const { data: marks } = await supabase.from('ct_marks').select('*').eq('student_id', id);

      // 4. Combine the course list with their specific marks
      let combinedMarks: CourseMark[] = [];
      if (courses) {
        combinedMarks = courses.map(course => {
          const markRecord = marks?.find(m => m.course_code === course.course_code);
          return {
            course_code: course.course_code,
            course_name: course.course_name,
            credit: course.credit,
            ct1: markRecord ? parseFloat(markRecord.ct1) || 0 : 0,
            ct2: markRecord ? parseFloat(markRecord.ct2) || 0 : 0,
            ct3: markRecord ? parseFloat(markRecord.ct3) || 0 : 0,
            ct4: markRecord ? parseFloat(markRecord.ct4) || 0 : 0,
          };
        });
      }
      setCourseMarks(combinedMarks);
    }
    setLoading(false);
  };

  const fetchNotices = async () => {
    const { data } = await supabase.from('department_notices').select('*').order('created_at', { ascending: false });
    if (data) setNotices(data);
  };

  const handleLogout = () => {
    localStorage.removeItem('student_user');
    router.replace('/student-login');
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) return alert('Password must be at least 6 characters.');
    await supabase.from('master_students').update({ student_password: newPassword }).eq('id', studentData.id);
    alert('Password updated successfully!');
    setIsPwdModalOpen(false);
    setNewPassword('');
  };

  if (loading || !studentData) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-500">Loading Profile...</div>;

  // --- AUTOMATED ELIGIBILITY LOGIC ---
  const totalDues = (studentData.monthly_due || 0) + (studentData.semester_due || 0) + (studentData.exam_due || 0) + (studentData.attendance_fine || 0);
  const hasGoodAttendance = studentData.attendance_percentage >= 60;
  const isFinanciallyCleared = totalDues === 0;
  const isEligible = studentData.eligibility_override || (hasGoodAttendance && isFinanciallyCleared);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      {/* HEADER */}
      <header className="max-w-6xl mx-auto flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">ICE</div>
          <h1 className="text-xl font-black text-slate-800">Student Space</h1>
        </div>
        <div className="flex space-x-3">
          <button onClick={() => setIsPwdModalOpen(true)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-200 transition-colors">Change Password</button>
          <button onClick={handleLogout} className="px-4 py-2 bg-rose-50 text-rose-600 font-bold text-sm rounded-lg hover:bg-rose-100 transition-colors">Logout</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: IDENTITY */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center">
            <div className="w-24 h-24 mx-auto bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center text-3xl font-black mb-4 shadow-sm border-4 border-white">
              {studentData.name.charAt(0)}
            </div>
            <h2 className="text-2xl font-black text-slate-900">{studentData.name}</h2>
            <p className="text-indigo-600 font-bold text-sm mb-4">RU ID: {studentData.ru_id || 'N/A'}</p>
            
            <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm">
              <p><span className="font-bold text-slate-500">College ID:</span> <span className="text-slate-800 font-semibold">{studentData.college_id}</span></p>
              <p><span className="font-bold text-slate-500">Semester:</span> <span className="text-slate-800 font-semibold">{studentData.semester}</span></p>
              <p><span className="font-bold text-slate-500">Advisor:</span> <span className="text-slate-800 font-semibold">{studentData.advisor || 'Not Assigned'}</span></p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: BENCHMARKS & MARKS & NOTICES */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* EXAM SIGNAL BANNER */}
          <div className={`p-6 rounded-2xl shadow-sm border-2 flex items-center justify-between ${isEligible ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <div>
              <p className={`text-sm font-bold uppercase tracking-wider ${isEligible ? 'text-emerald-600' : 'text-rose-600'}`}>Final Exam Registration Status</p>
              <h2 className={`text-3xl font-black ${isEligible ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isEligible ? '🟢 ELIGIBLE TO REGISTER' : '🔴 REGISTRATION BLOCKED'}
              </h2>
              {!isEligible && <p className="text-rose-600 font-medium text-sm mt-1">You must clear financial dues and maintain 60%+ attendance.</p>}
              {studentData.eligibility_override && <p className="text-emerald-700 font-bold text-xs mt-1 bg-emerald-100 inline-block px-2 py-1 rounded">Manually Approved by Coordinator</p>}
            </div>
          </div>

          {/* READ-ONLY METRICS */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Attendance</p>
              <p className={`text-4xl font-black ${hasGoodAttendance ? 'text-emerald-600' : 'text-rose-600'}`}>{studentData.attendance_percentage}%</p>
              <p className="text-xs font-bold text-slate-500 mt-2">Target: 60% Minimum</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Outstanding Dues</p>
              <p className={`text-4xl font-black ${isFinanciallyCleared ? 'text-emerald-600' : 'text-rose-600'}`}>৳{totalDues}</p>
              <p className="text-xs font-bold text-slate-500 mt-2">Target: ৳0 Balance</p>
            </div>
          </div>

          {/* NEW: ENROLLED COURSES & CT MARKS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200">
              <h3 className="text-slate-800 font-bold flex items-center"><span className="mr-2">📝</span> Semester {studentData.semester} Courses & CT Marks</h3>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase">Course</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-center">CT-1</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-center">CT-2</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-center">CT-3</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-center">CT-4</th>
                    <th className="p-3 text-xs font-black text-indigo-700 uppercase text-center">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courseMarks.map((course, idx) => {
                    const isTwoCredit = course.credit === 2;
                    const divider = isTwoCredit ? 3 : 4;
                    const total = course.ct1 + course.ct2 + course.ct3 + (isTwoCredit ? 0 : course.ct4);
                    const avg = (total / divider).toFixed(1);

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-sm">
                          <span className="font-bold text-slate-800 block">{course.course_code}</span>
                          <span className="text-xs text-slate-500">{course.course_name} ({course.credit} Cr)</span>
                        </td>
                        <td className="p-3 text-sm text-center font-medium text-slate-700">{course.ct1 || '-'}</td>
                        <td className="p-3 text-sm text-center font-medium text-slate-700">{course.ct2 || '-'}</td>
                        <td className="p-3 text-sm text-center font-medium text-slate-700">{course.ct3 || '-'}</td>
                        <td className="p-3 text-sm text-center font-medium text-slate-700">
                          {!isTwoCredit ? (course.ct4 || '-') : <span className="text-slate-400 text-xs italic bg-slate-100 px-2 py-1 rounded">N/A</span>}
                        </td>
                        <td className="p-3 text-sm text-center font-black text-indigo-700 bg-indigo-50/50 rounded-r-lg">
                          {avg}
                        </td>
                      </tr>
                    );
                  })}
                  {courseMarks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">No courses have been assigned to your semester yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* NOTICES BOARD */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 p-4">
              <h3 className="text-white font-bold flex items-center"><span className="mr-2">📢</span> Department Broadcasts</h3>
            </div>
            <div className="p-0 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {notices.length === 0 ? (
                <p className="p-8 text-center text-slate-500 font-medium">No active notices.</p>
              ) : (
                notices.map(notice => (
                  <div key={notice.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <p className="text-xs font-bold text-indigo-500 mb-1">{new Date(notice.created_at).toLocaleDateString()} • {notice.posted_by}</p>
                    <h4 className="text-lg font-bold text-slate-900 mb-2">{notice.title}</h4>
                    <p className="text-sm text-slate-600 mb-4 whitespace-pre-wrap">{notice.description}</p>
                    {notice.file_url && (
                      <a href={notice.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors">
                        📄 View Attached Document
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* PASSWORD CHANGE MODAL */}
      {isPwdModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-sm animate-in fade-in zoom-in duration-200">
            <h3 className="font-bold text-lg mb-4 text-slate-800">Change Student Password</h3>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Minimum 6 characters" />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setIsPwdModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={handleUpdatePassword} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}