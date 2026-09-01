'use client'; 

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../utils/supabase';
import { useRouter } from 'next/navigation';

type AcademicStudent = {
  id: string;
  college_id: string;
  ru_id: string;
  name: string;
  semester: number;
  attendance_percentage: number;
  internal_marks_status: string;
  student_contact: string;
  guardian_contact: string;
  advisor: string;
};

type Course = {
  id: string;
  semester: number;
  course_code: string;
  course_name: string;
  credit: number;
  teacher_name: string;
  teacher_email: string;
  attendance_sheet_url?: string; // NEW: Google Sheet URL reference
};

export default function AcademicDashboard() {

  // --- AUTH & PASSWORD STATE ---
  const router = useRouter();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // --- STATE MANAGEMENT ---
  const [students, setStudents] = useState<AcademicStudent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teacherName, setTeacherName] = useState('Loading Faculty...');
  
  const [selectedSemester, setSelectedSemester] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'roster' | 'ct_marks' | 'curriculum'>('roster');
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sheetUrl, setSheetUrl] = useState(''); // State for Google Sheet URL
  
  // File Refs for CSV Uploads
  const ctFileInputRef = useRef<HTMLInputElement>(null);
  const attendanceFileInputRef = useRef<HTMLInputElement>(null);

  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Modal & Form States
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'add_student' | 'edit_student' | 'edit_course' | null;
    targetId: string | null;
  }>({ isOpen: false, type: null, targetId: null });

  const [studentForm, setStudentForm] = useState<Partial<AcademicStudent>>({ semester: 1 });
  const [courseForm, setCourseForm] = useState<Partial<Course>>({ semester: 1, credit: 3 });

  // --- INITIALIZATION ---
  useEffect(() => {
    const session = localStorage.getItem('faculty_user');
    if (session) {
      const user = JSON.parse(session);
      setTeacherName(user.name);
    }
    fetchData();
  }, [activeTab, selectedCourseCode]);

  const fetchData = async () => {
    const { data: studentData } = await supabase.from('master_students').select('*').order('ru_id', { ascending: false }); 
    const { data: courseData } = await supabase.from('courses').select('*').order('semester', { ascending: true });

    if (studentData) {
      setStudents(studentData as AcademicStudent[]);
      let initialEdits: Record<string, any> = {};
      studentData.forEach(student => {
        initialEdits[student.id] = {
          attendance_percentage: student.attendance_percentage || 0,
          internal_marks_status: student.internal_marks_status || 'Pending',
          ct1: 0, ct2: 0, ct3: 0, ct4: 0 
        };
      }); 
      if (activeTab === 'ct_marks' && selectedCourseCode) {
        const { data: marksData } = await supabase.from('ct_marks').select('*').eq('course_code', selectedCourseCode);
        if (marksData) {
          marksData.forEach(mark => {
            if (initialEdits[mark.student_id]) {
              initialEdits[mark.student_id].ct1 = parseFloat(mark.ct1) || 0;
              initialEdits[mark.student_id].ct2 = parseFloat(mark.ct2) || 0;
              initialEdits[mark.student_id].ct3 = parseFloat(mark.ct3) || 0;
              initialEdits[mark.student_id].ct4 = parseFloat(mark.ct4) || 0;
            }
          });
        }
      }
      setEditValues(initialEdits);
    }
    if (courseData) setCourses(courseData as Course[]);
  };

  // --- DERIVED SYNCHRONIZED DATA ---
  const displayedStudents = selectedSemester === 'All' ? students : students.filter(s => s.semester.toString() === selectedSemester);
  const displayedCourses = selectedSemester === 'All' ? courses : courses.filter(c => c.semester.toString() === selectedSemester);
  const currentCourseDetails = courses.find(c => c.course_code === selectedCourseCode);

  // Sync Sheet URL input when a new course is selected
  useEffect(() => {
    if (currentCourseDetails) {
      setSheetUrl(currentCourseDetails.attendance_sheet_url || '');
    } else {
      setSheetUrl('');
    }
  }, [currentCourseDetails]);

  const handleInputChange = (id: string, field: string, value: string | number) => {
    setEditValues(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  // --- AUTH ACTIONS ---
  const handleLogout = () => {
    localStorage.removeItem('faculty_user');
    router.replace('/login');
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      return alert('Password must be at least 6 characters long.');
    }

    setIsUpdatingPassword(true);
    const session = localStorage.getItem('faculty_user');

    if (session) {
      const user = JSON.parse(session);
      const { error } = await supabase
        .from('faculty_users')
        .update({ password: newPassword })
        .eq('email', user.email);

      if (!error) {
        alert('Password updated successfully!');
        setIsPasswordModalOpen(false);
        setNewPassword('');
      } else {
        alert(`Error updating password: ${error.message}`);
      }
    }
    setIsUpdatingPassword(false);
  };   

  // --- STUDENT MANAGEMENT (ADD / UPDATE / DELETE) ---
  const handleSaveStudent = async () => {
    if (!studentForm.name || !studentForm.college_id) return alert("Name and College ID are required.");

    if (modalConfig.type === 'add_student') {
      const { error } = await supabase.from('master_students').insert([studentForm]);
      if (!error) {
        showMessage('Student added successfully.');
        setModalConfig({ isOpen: false, type: null, targetId: null });
        fetchData();
      } else showMessage(`Error: ${error.message}`);
    } else if (modalConfig.type === 'edit_student' && modalConfig.targetId) {
      const { error } = await supabase.from('master_students').update(studentForm).eq('id', modalConfig.targetId);
      if (!error) {
        showMessage('Student updated successfully.');
        setModalConfig({ isOpen: false, type: null, targetId: null });
        fetchData();
      } else showMessage(`Error: ${error.message}`);
    }
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to permanently delete student: ${name}?`)) {
      const { error } = await supabase.from('master_students').delete().eq('id', id);
      if (!error) {
        showMessage(`${name} has been deleted.`);
        fetchData();
      } else showMessage(`Error: ${error.message}`);
    }
  };

  // --- COURSE MANAGEMENT (CREATE / UPDATE / DELETE) ---
  const handleSaveCourse = async () => {
    if (!courseForm.course_code || !courseForm.course_name) return alert("Course Code and Name are required.");

    if (modalConfig.type === 'edit_course' && modalConfig.targetId) {
      const { error } = await supabase.from('courses').update(courseForm).eq('id', modalConfig.targetId);
      if (!error) {
        showMessage('Course updated successfully.');
        setModalConfig({ isOpen: false, type: null, targetId: null });
        fetchData();
      } else showMessage(`Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('courses').insert([courseForm]);
      if (!error) {
        showMessage(`Course ${courseForm.course_code} created.`);
        setCourseForm({ semester: parseInt(selectedSemester) || 1, credit: 3 });
        fetchData();
      } else showMessage(`Error: ${error.message}`);
    }
  };

  const handleDeleteCourse = async (id: string, code: string) => {
    if (window.confirm(`Are you sure you want to delete course ${code}? This may affect linked CT marks.`)) {
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (!error) {
        showMessage(`Course ${code} deleted.`);
        if (selectedCourseCode === code) setSelectedCourseCode('');
        fetchData();
      } else showMessage(`Error: ${error.message}`);
    }
  };

  // --- INLINE SAVES (Attendance, Sheet Link & CT) ---
  const handleSaveSheetUrl = async () => {
    if (!currentCourseDetails) return;
    setIsSaving('sheet');
    const { error } = await supabase
      .from('courses')
      .update({ attendance_sheet_url: sheetUrl })
      .eq('id', currentCourseDetails.id);
      
    if (!error) {
      showMessage('Google Sheet Link saved successfully.');
      fetchData();
    } else {
      alert('Failed to save link.');
    }
    setIsSaving(null);
  };

  const handleSaveAttendance = async (studentId: string) => {
    setIsSaving(studentId);
    const newValues = editValues[studentId];
    const { error } = await supabase.from('master_students')
      .update({ attendance_percentage: newValues.attendance_percentage, internal_marks_status: newValues.internal_marks_status })
      .eq('id', studentId);
    if (!error) showMessage(`Attendance saved.`);
    setIsSaving(null);
  };

  const handleSaveCTMarks = async (studentId: string) => {
    if (!selectedCourseCode) return alert("Select a course first.");
    setIsSaving(studentId);
    const newValues = editValues[studentId];
    const { error } = await supabase.from('ct_marks')
      .upsert({ 
        student_id: studentId, course_code: selectedCourseCode,
        ct1: newValues.ct1, ct2: newValues.ct2, ct3: newValues.ct3, ct4: newValues.ct4,
      }, { onConflict: 'student_id,course_code' });
    if (!error) showMessage(`Marks saved.`);
    setIsSaving(null);
  };

  const calculateCTAverage = (studentId: string, credit: number) => {
    const vals = editValues[studentId];
    if (!vals) return 0;
    const divider = credit === 2 ? 3 : 4;
    const total = (vals.ct1 || 0) + (vals.ct2 || 0) + (vals.ct3 || 0) + (credit === 2 ? 0 : (vals.ct4 || 0));
    return (total / divider).toFixed(1);
  };

  const openModal = (type: any, data: any = null) => {
    setModalConfig({ isOpen: true, type, targetId: data?.id || null });
    if (type === 'add_student') setStudentForm({ semester: selectedSemester !== 'All' ? parseInt(selectedSemester) : 1 });
    if (type === 'edit_student') setStudentForm(data);
    if (type === 'edit_course') setCourseForm(data);
  };

  // --- CT MARKS & EMAIL ACTIONS ---
  const exportGradingSheet = () => {
    if (!currentCourseDetails) return alert("Select a course first.");
    const maxCTs = currentCourseDetails.credit === 2 ? 3 : 4;
    let csv = `College ID,RU ID,Name,CT1,CT2,CT3${maxCTs === 4 ? ',CT4' : ''}\n`;
    displayedStudents.forEach(s => csv += `${s.college_id},${s.ru_id || 'N/A'},${s.name},0,0,0${maxCTs === 4 ? ',0' : ''}\n`);
    const link = document.createElement('a');
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `${currentCourseDetails.course_code}_Grading.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleCTFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentCourseDetails) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rows = (event.target?.result as string).split('\n').filter(r => r.trim() !== ''); 
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(',');
        const student = students.find(s => s.college_id === cols[0]?.trim());
        if (student) {
          await supabase.from('ct_marks').upsert({
            student_id: student.id, course_code: currentCourseDetails.course_code,
            ct1: parseFloat(cols[3])||0, ct2: parseFloat(cols[4])||0, ct3: parseFloat(cols[5])||0,
            ct4: currentCourseDetails.credit === 3 ? (parseFloat(cols[6])||0) : 0
          }, { onConflict: 'student_id,course_code' });
        }
      }
      showMessage(`CT Marks imported successfully.`);
      fetchData(); if (ctFileInputRef.current) ctFileInputRef.current.value = ''; 
    };
    reader.readAsText(file);
  };

  const handleEmailRoster = async (type: 'ct_marks' | 'attendance') => {
    if (!currentCourseDetails) {
      return alert("Select a course first.");
    }

    const targetEmail = currentCourseDetails.teacher_email;
    if (!targetEmail) return alert("This course does not have a valid teacher email configured in the Curriculum tab.");

    setIsSendingEmail(true);
    showMessage(`Preparing to email template to ${targetEmail}...`);

    let csv = '';
    let subject = '';

    if (type === 'ct_marks') {
      const maxCTs = currentCourseDetails.credit === 2 ? 3 : 4;
      csv = `College ID,RU ID,Name,CT1,CT2,CT3${maxCTs === 4 ? ',CT4' : ''}\n`;
      displayedStudents.forEach(s => csv += `${s.college_id},${s.ru_id || 'N/A'},${s.name},0,0,0${maxCTs === 4 ? ',0' : ''}\n`);
      subject = `${currentCourseDetails.course_code} Grading Sheet`;
    } else {
      csv = `College ID,RU ID,Name,Total Classes Held,Classes Attended\n`;
      displayedStudents.forEach(s => csv += `${s.college_id},${s.ru_id || 'N/A'},${s.name},0,0\n`);
      subject = `${currentCourseDetails.course_code} Attendance Template`;
    }

    try {
      const response = await fetch('/api/academic/send-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherEmail: targetEmail,
          subject: subject,
          csvData: csv,
          type: type,
          sheetUrl: type === 'attendance' ? currentCourseDetails.attendance_sheet_url : null // Optional: Backend can include this in the email body
        })
      });

      if (response.ok) {
        showMessage('✅ Email sent successfully!');
      } else {
        showMessage('⚠️ Failed to send email. Ensure the API route is configured.');
      }
    } catch (error) {
      showMessage('❌ Server error while sending email.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleAttendanceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rows = (event.target?.result as string).split('\n').filter(r => r.trim() !== ''); 
      let uploadCount = 0;
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(',');
        const student = students.find(s => s.college_id === cols[0]?.trim());

        if (student) {
          const totalClasses = parseFloat(cols[3]) || 0;
          const attended = parseFloat(cols[4]) || 0;
          let calculatedPercentage = student.attendance_percentage; // Default fallback

          if (totalClasses > 0) {
            calculatedPercentage = Math.round((attended / totalClasses) * 100);
            if (calculatedPercentage > 100) calculatedPercentage = 100;
          } else if (attended > 0 && totalClasses === 0) {
            calculatedPercentage = attended > 100 ? 100 : attended;
          }

          await supabase.from('master_students')
            .update({ attendance_percentage: calculatedPercentage })
            .eq('id', student.id);

          uploadCount++;
        }
      }
      showMessage(`Calculated and published attendance for ${uploadCount} students.`);
      fetchData(); if (attendanceFileInputRef.current) attendanceFileInputRef.current.value = ''; 
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f9] p-6 lg:p-10 font-sans text-slate-800">
      {/* HEADER */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-5">
          <div className="flex -space-x-3">
            <div className="w-14 h-14 rounded-full bg-white shadow-sm border-2 border-slate-200 flex items-center justify-center z-10 overflow-hidden"><span className="text-xs font-bold text-slate-400 text-center leading-tight">ICE<br/>Logo</span></div>
            <div className="w-14 h-14 rounded-full bg-indigo-50 shadow-sm border-2 border-indigo-200 flex items-center justify-center z-0 overflow-hidden"><span className="text-[10px] font-bold text-indigo-500 text-center leading-tight">Dept<br/>Logo</span></div>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Academic Coordination</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">{teacherName} | Department of CSE</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsPasswordModalOpen(true)}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-bold shadow-sm transition-colors"
          >
            Change Password
          </button>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">

        {/* TOOLBAR */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <div className="flex space-x-2">
              <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${activeTab === 'roster' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>👥 Roster & Attendance</button>
              <button onClick={() => setActiveTab('ct_marks')} className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${activeTab === 'ct_marks' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>📝 CT Marks Mgt</button>
              <button onClick={() => setActiveTab('curriculum')} className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${activeTab === 'curriculum' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>⚙️ Curriculum & Faculty</button>
            </div>
            {message && <p className="text-xs text-emerald-600 mt-2 font-bold bg-emerald-50 inline-block px-2 py-1 rounded">{message}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-bold text-slate-600">Batch Filter:</label>
              <select value={selectedSemester} onChange={(e) => { setSelectedSemester(e.target.value); setSelectedCourseCode(''); }} className="border border-slate-300 rounded-lg p-2 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="All">All Semesters</option>
                {[1,2,3,4,5,6,7,8].map(num => <option key={num} value={num}>Semester {num}</option>)}
              </select>
            </div>

            {/* ASSIGNED COURSE SHOWS IN BOTH CT MARKS & ROSTER */}
            {(activeTab === 'ct_marks' || activeTab === 'roster') && selectedSemester !== 'All' && (
              <div className="flex items-center space-x-2 border-l border-slate-300 pl-4">
                <label className="text-sm font-bold text-indigo-700">Assigned Course:</label>
                <select value={selectedCourseCode} onChange={(e) => setSelectedCourseCode(e.target.value)} className="border border-indigo-200 rounded-lg p-2 text-sm text-indigo-800 bg-indigo-50 font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">-- Select Course --</option>
                  {displayedCourses.map(course => <option key={course.course_code} value={course.course_code}>{course.course_code}</option>)}
                </select>
              </div>
            )}

            {activeTab === 'roster' && (
               <button onClick={() => openModal('add_student')} className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 shadow-sm ml-2">
                 + Add Student
               </button>
            )}
          </div>
        </div>

        {/* TAB 1: ROSTER & ATTENDANCE */}
        {activeTab === 'roster' && (
          <>
            {/* UPDATED: DYNAMIC COURSE ATTENDANCE WORKFLOW */}
            <div className="bg-blue-50 border-b border-blue-100 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-blue-900">
                  {selectedCourseCode ? `Course Attendance: ${currentCourseDetails?.course_code}` : 'Bulk Attendance Collection'}
                </h3>
                <p className="text-xs text-blue-700 font-medium">
                  {selectedCourseCode ? `Managing attendance for ${currentCourseDetails?.teacher_name}. Link a Google Sheet below.` : 'Select an Assigned Course above to manage Google Sheets and email templates.'}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-2 items-center">
                {selectedCourseCode ? (
                  <>
                    <input 
                      type="text" 
                      placeholder="Paste Google Sheet URL..." 
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="px-3 py-1.5 border border-blue-200 rounded-md text-xs w-48 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={handleSaveSheetUrl} className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-md text-xs font-bold hover:bg-blue-100 shadow-sm transition-colors">
                      {isSaving === 'sheet' ? 'Saving...' : 'Save Link'}
                    </button>
                    
                    {currentCourseDetails?.attendance_sheet_url && (
                      <a href={currentCourseDetails.attendance_sheet_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-emerald-500 text-white rounded-md text-xs font-bold hover:bg-emerald-600 shadow-sm flex items-center">
                        📊 View Sheet
                      </a>
                    )}

                    <button onClick={() => handleEmailRoster('attendance')} disabled={isSendingEmail} className={`px-3 py-1.5 ${isSendingEmail ? 'bg-blue-300 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'} rounded-md text-xs font-bold shadow-sm transition-colors`}>
                      📧 {isSendingEmail ? 'Sending...' : 'Email to Teacher'}
                    </button>

                    <label className="px-3 py-1.5 bg-slate-800 text-white rounded-md text-xs font-bold hover:bg-slate-900 cursor-pointer shadow-sm transition-colors">
                      ⬆️ Publish CSV 
                      <input type="file" accept=".csv" className="hidden" ref={attendanceFileInputRef} onChange={handleAttendanceUpload} />
                    </label>
                  </>
                ) : (
                  <span className="text-xs font-bold text-blue-800 bg-blue-100 px-3 py-1.5 rounded-md border border-blue-200 shadow-sm">
                    ⚠️ Select an Assigned Course to unlock workflows
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto p-4">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-3 text-sm font-bold text-slate-500">College ID</th>
                      <th className="p-3 text-sm font-bold text-slate-500">RU ID</th>
                      <th className="p-3 text-sm font-bold text-slate-500">Name</th>
                      <th className="p-3 text-sm font-bold text-slate-500">Student Contact</th>
                      <th className="p-3 text-sm font-bold text-slate-500">Guardian Contact</th>
                      <th className="p-3 text-sm font-bold text-slate-500 text-center">Attendance (%)</th>
                      <th className="p-3 text-sm font-bold text-slate-500 text-center">Save Record</th>
                      <th className="p-3 text-sm font-bold text-slate-500 text-center">Manage</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedStudents.map((student) => {
                    const edits = editValues[student.id] || {};
                    return (
                      <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-sm font-medium text-slate-900">{student.college_id}</td>
                        <td className="p-3 text-sm text-slate-500">{student.ru_id || 'N/A'}</td>
                        <td className="p-3 text-sm font-medium text-slate-700">{student.name}</td>
                        <td className="p-3 text-sm text-slate-500">{student.student_contact || '-'}</td>
                        <td className="p-3 text-sm text-slate-500">{student.guardian_contact || '-'}</td>

                        <td className="p-3 text-sm text-center">
                            <input type="number" min="0" max="100" value={edits.attendance_percentage ?? ''} onChange={(e) => handleInputChange(student.id, 'attendance_percentage', parseInt(e.target.value) || 0)} className={`w-20 border rounded-lg p-1.5 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 ${(edits.attendance_percentage || 0) < 75 ? 'border-rose-300 text-rose-600 bg-rose-50' : 'border-slate-300 text-slate-900'}`} />
                        </td>
                        <td className="p-3 text-sm text-center">
                            <button onClick={() => handleSaveAttendance(student.id)} disabled={isSaving === student.id} className="px-3 py-1 bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-bold hover:bg-blue-200 transition-colors">
                            {isSaving === student.id ? '...' : 'Save Att.'}
                            </button>
                        </td>
                        <td className="p-3 text-sm text-center">
                            <button onClick={() => openModal('edit_student', student)} className="text-indigo-600 hover:text-indigo-800 font-bold text-xs mx-2">Edit</button>
                            <button onClick={() => handleDeleteStudent(student.id, student.name)} className="text-rose-600 hover:text-rose-800 font-bold text-xs mx-2">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedStudents.length === 0 && (
                    <tr><td colSpan={8} className="p-10 text-center text-slate-500 font-medium bg-slate-50/50">No students found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB 2: CT MARKS */}
        {activeTab === 'ct_marks' && (
          <>
            {selectedCourseCode && (
              <div className="bg-indigo-50 border-b border-indigo-100 p-4 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-indigo-900">Teacher Grading Workflow</h3>
                  <p className="text-xs text-indigo-700 font-medium">Coordinating roster for {currentCourseDetails?.teacher_name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleEmailRoster('ct_marks')} disabled={isSendingEmail} className={`px-3 py-1.5 ${isSendingEmail ? 'bg-indigo-300 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'} rounded-md text-xs font-bold shadow-sm transition-colors`}>
                    📧 {isSendingEmail ? 'Sending...' : 'Email Grading Sheet'}
                  </button>
                  <button onClick={exportGradingSheet} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-md text-xs font-bold hover:bg-indigo-100 shadow-sm transition-colors">⬇️ Download CSV</button>
                  <label className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 cursor-pointer shadow-sm transition-colors">
                    ⬆️ Upload Filled CSV <input type="file" accept=".csv" className="hidden" ref={ctFileInputRef} onChange={handleCTFileUpload} />
                  </label>
                </div>
              </div>
            )}

            <div className="overflow-x-auto p-4">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                    <tr className="bg-indigo-50/50 border-b border-indigo-100">
                      <th className="p-3 text-sm font-bold text-indigo-800">College ID</th>
                      <th className="p-3 text-sm font-bold text-indigo-800">RU ID</th>
                      <th className="p-3 text-sm font-bold text-indigo-800">Name</th>
                      <th className="p-3 text-sm font-bold text-indigo-800 w-16 text-center">CT-1</th>
                      <th className="p-3 text-sm font-bold text-indigo-800 w-16 text-center">CT-2</th>
                      <th className="p-3 text-sm font-bold text-indigo-800 w-16 text-center">CT-3</th>
                      <th className="p-3 text-sm font-bold text-indigo-800 w-16 text-center">CT-4</th>
                      <th className="p-3 text-sm font-black text-indigo-900 bg-indigo-100 w-20 text-center">Avg</th>
                      <th className="p-3 text-sm font-bold text-indigo-800 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedStudents.map((student) => {
                    const edits = editValues[student.id] || {};
                    const isTwoCredit = currentCourseDetails?.credit === 2;
                    const maxMarks = isTwoCredit ? 10 : 15;
                    const ctInputClass = "w-14 border border-slate-300 rounded p-1 text-sm font-medium text-center focus:ring-2 focus:ring-indigo-500 outline-none";
                    const avg = calculateCTAverage(student.id, currentCourseDetails?.credit || 3);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-sm font-medium text-slate-900">{student.college_id}</td>
                        <td className="p-3 text-sm text-slate-500">{student.ru_id || 'N/A'}</td>
                        <td className="p-3 text-sm font-medium text-slate-700">{student.name}</td>
                        
                        <td className="p-3 text-sm text-center"><input type="number" min="0" max={maxMarks} value={edits.ct1 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct1', parseFloat(e.target.value) || 0)} className={ctInputClass} /></td>
                        <td className="p-3 text-sm text-center"><input type="number" min="0" max={maxMarks} value={edits.ct2 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct2', parseFloat(e.target.value) || 0)} className={ctInputClass} /></td>
                        <td className="p-3 text-sm text-center"><input type="number" min="0" max={maxMarks} value={edits.ct3 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct3', parseFloat(e.target.value) || 0)} className={ctInputClass} /></td>
                        <td className="p-3 text-sm text-center">
                            {!isTwoCredit ? <input type="number" min="0" max={maxMarks} value={edits.ct4 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct4', parseFloat(e.target.value) || 0)} className={ctInputClass} /> : <span className="text-slate-400 text-xs font-bold italic bg-slate-100 px-2 py-1 rounded">N/A</span>}
                        </td>
                        <td className="p-3 text-sm text-center font-black text-indigo-700 bg-indigo-50/50">{avg}</td>
                        <td className="p-3 text-sm text-center">
                            <button onClick={() => handleSaveCTMarks(student.id)} disabled={isSaving === student.id} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                            {isSaving === student.id ? 'Saving...' : 'Save'}
                            </button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedStudents.length === 0 && (
                    <tr><td colSpan={9} className="p-10 text-center text-slate-500 font-medium bg-slate-50/50">Select a course to view roster.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB 3: CURRICULUM MANAGEMENT */}
        {activeTab === 'curriculum' && (
          <div className="p-6 space-y-8 bg-slate-50/50">
            {/* Create/Edit Course Panel */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="border-b border-slate-100 pb-3 mb-5">
                <h3 className="text-lg font-bold text-slate-800">Create New Course / Assign Faculty</h3>
                <p className="text-xs text-slate-500 mt-1">Configure curriculum details for the selected batch.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Semester</label>
                  <select value={courseForm.semester} onChange={(e) => setCourseForm({...courseForm, semester: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Semester {n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Course Code</label>
                  <input type="text" placeholder="CSE-3101" value={courseForm.course_code || ''} onChange={(e) => setCourseForm({...courseForm, course_code: e.target.value})} className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Course Title</label>
                  <input type="text" placeholder="Data Structures" value={courseForm.course_name || ''} onChange={(e) => setCourseForm({...courseForm, course_name: e.target.value})} className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Credits</label>
                  <select value={courseForm.credit} onChange={(e) => setCourseForm({...courseForm, credit: parseInt(e.target.value)})} className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                    <option value={2}>2 Credits (3 CTs, Max 10)</option>
                    <option value={3}>3 Credits (4 CTs, Max 15)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Faculty Name</label>
                  <input type="text" placeholder="Jane Doe" value={courseForm.teacher_name || ''} onChange={(e) => setCourseForm({...courseForm, teacher_name: e.target.value})} className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Faculty Email</label>
                  <input type="email" placeholder="jane@imperial.edu" value={courseForm.teacher_email || ''} onChange={(e) => setCourseForm({...courseForm, teacher_email: e.target.value})} className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={handleSaveCourse} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 shadow-md">
                  + Add to Catalog
                </button>
              </div>
            </div>

            {/* Active Course Catalog */}
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4">Course Catalog {selectedSemester !== 'All' ? `(Semester ${selectedSemester})` : ''}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayedCourses.map(c => (
                  <div key={c.id} className="p-5 border border-slate-200 rounded-xl shadow-sm bg-white hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-bl-full -z-10"></div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-full">Sem {c.semester}</span>
                      <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-bold border border-slate-200">{c.credit} Cr</span>
                    </div>
                    <h4 className="font-extrabold text-slate-900 text-lg mt-2">{c.course_code}</h4>
                    <p className="font-medium text-slate-700 text-sm mb-3">{c.course_name}</p>
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-end">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Instructor</p>
                        <p className="text-sm font-medium text-slate-800">{c.teacher_name}</p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                        <button onClick={() => openModal('edit_course', c)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-xs font-bold">Edit</button>
                        <button onClick={() => handleDeleteCourse(c.id, c.course_code)} className="p-1.5 bg-rose-50 text-rose-600 rounded hover:bg-rose-100 text-xs font-bold">Del</button>
                      </div>
                    </div>
                  </div>
                ))}
                {displayedCourses.length === 0 && (
                  <div className="col-span-full bg-white p-8 rounded-xl border border-dashed border-slate-300 text-center"><p className="text-slate-500 font-medium">No courses found for this filter.</p></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- REUSABLE MODAL (Student Form) --- */}
      {modalConfig.isOpen && (modalConfig.type === 'add_student' || modalConfig.type === 'edit_student') && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">{modalConfig.type === 'add_student' ? 'Add New Student' : 'Edit Student Profile'}</h3>
              <button onClick={() => setModalConfig({ isOpen: false, type: null, targetId: null })} className="text-slate-400 hover:text-slate-700 font-bold text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">College ID *</label>
                  <input type="text" value={studentForm.college_id || ''} onChange={(e) => setStudentForm({...studentForm, college_id: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">RU ID</label>
                  <input type="text" value={studentForm.ru_id || ''} onChange={(e) => setStudentForm({...studentForm, ru_id: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Full Name *</label>
                  <input type="text" value={studentForm.name || ''} onChange={(e) => setStudentForm({...studentForm, name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Semester</label>
                  <select value={studentForm.semester} onChange={(e) => setStudentForm({...studentForm, semester: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Semester {n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Semester</label>
                  <select value={studentForm.semester} onChange={(e) => setStudentForm({...studentForm, semester: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Semester {n}</option>)}
                  </select>
                </div>
                
                {/* --- NEW ADVISOR FIELD --- */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Assigned Advisor</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Prof. Jane Doe"
                    value={studentForm.advisor || ''} 
                    onChange={(e) => setStudentForm({...studentForm, advisor: e.target.value})} 
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Student Contact Number</label>
                  <input type="text" placeholder="+880..." value={studentForm.student_contact || ''} onChange={(e) => setStudentForm({...studentForm, student_contact: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Guardian Contact Number</label>
                  <input type="text" placeholder="+880..." value={studentForm.guardian_contact || ''} onChange={(e) => setStudentForm({...studentForm, guardian_contact: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button onClick={handleSaveStudent} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors">
                Save Student Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REUSABLE MODAL (Edit Course) */}
      {modalConfig.isOpen && modalConfig.type === 'edit_course' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
             <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">Edit Course</h3>
              <button onClick={() => setModalConfig({ isOpen: false, type: null, targetId: null })} className="text-slate-400 hover:text-slate-700 font-bold text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Course Title</label>
                  <input type="text" value={courseForm.course_name || ''} onChange={(e) => setCourseForm({...courseForm, course_name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Faculty Name</label>
                  <input type="text" value={courseForm.teacher_name || ''} onChange={(e) => setCourseForm({...courseForm, teacher_name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                 <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Faculty Email</label>
                  <input type="email" value={courseForm.teacher_email || ''} onChange={(e) => setCourseForm({...courseForm, teacher_email: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <button onClick={handleSaveCourse} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors">Update Course</button>
            </div>
          </div>
        </div>
      )}
      {/* PASSWORD CHANGE MODAL */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">Change Password</h3>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 mb-4">Update the login password for your faculty account. This will take effect immediately.</p>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-slate-800"
                />
              </div>
              <button 
                onClick={handleUpdatePassword} 
                disabled={isUpdatingPassword}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Updating...' : 'Confirm Password Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}