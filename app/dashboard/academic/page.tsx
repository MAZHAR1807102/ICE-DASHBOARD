'use client'; 

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../utils/supabase';

type AcademicStudent = {
  id: string;
  college_id: string;
  name: string;
  semester: number;
  attendance_percentage: number;
  internal_marks_status: string;
};

type Course = {
  id: string;
  semester: number;
  course_code: string;
  course_name: string;
  credit: number;
  teacher_name: string;
  teacher_email: string;
};

export default function AcademicDashboard() {
  const [students, setStudents] = useState<AcademicStudent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  
  const [selectedSemester, setSelectedSemester] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'attendance' | 'ct_marks' | 'curriculum'>('attendance');
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editValues, setEditValues] = useState<Record<string, any>>({});
  
  // New Course Form State
  const [newCourse, setNewCourse] = useState<Partial<Course>>({ semester: 1, credit: 3 });

  // Email State
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const fetchData = async () => {
    const { data: studentData } = await supabase.from('master_students').select('*').order('college_id', { ascending: true });
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
              initialEdits[mark.student_id].ct1 = parseFloat(mark.ct1);
              initialEdits[mark.student_id].ct2 = parseFloat(mark.ct2);
              initialEdits[mark.student_id].ct3 = parseFloat(mark.ct3);
              initialEdits[mark.student_id].ct4 = parseFloat(mark.ct4);
            }
          });
        }
      }
      setEditValues(initialEdits);
    }
    if (courseData) setCourses(courseData as Course[]);
  };

  useEffect(() => { fetchData(); }, [activeTab, selectedCourseCode]);

  const displayedStudents = selectedSemester === 'All' ? students : students.filter(s => s.semester.toString() === selectedSemester);
  const availableCourses = selectedSemester !== 'All' ? courses.filter(c => c.semester.toString() === selectedSemester) : [];
  const currentCourseDetails = courses.find(c => c.course_code === selectedCourseCode);

  const handleInputChange = (id: string, field: string, value: string | number) => {
    setEditValues(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSaveAttendance = async (studentId: string, studentName: string) => {
    setIsSaving(studentId);
    const newValues = editValues[studentId];

    const { error } = await supabase
      .from('master_students')
      .update({ 
        attendance_percentage: newValues.attendance_percentage,
        internal_marks_status: newValues.internal_marks_status,
      })
      .eq('id', studentId);

    if (!error) setMessage(`Updated attendance for ${studentName}.`);
    else setMessage(`Error updating ${studentName}.`);
    
    setIsSaving(null);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSaveCTMarks = async (studentId: string, studentName: string) => {
    if (!selectedCourseCode) return alert("Please select a course first.");
    setIsSaving(studentId);
    
    const newValues = editValues[studentId];

    const { error } = await supabase
      .from('ct_marks')
      .upsert({ 
        student_id: studentId,
        course_code: selectedCourseCode,
        ct1: newValues.ct1,
        ct2: newValues.ct2,
        ct3: newValues.ct3,
        ct4: newValues.ct4,
      }, { onConflict: 'student_id,course_code' });

    if (!error) setMessage(`Saved marks for ${studentName}.`);
    else setMessage(`Error saving marks: ${error.message}`);
    
    setIsSaving(null);
    setTimeout(() => setMessage(''), 3000);
  };

  // --- 1. COURSE CREATION ---
  const handleCreateCourse = async () => {
    if (!newCourse.course_code || !newCourse.course_name) return alert("Course Code and Name are required.");
    const { error } = await supabase.from('courses').insert([newCourse]);
    if (!error) {
      setMessage(`Course ${newCourse.course_code} created successfully.`);
      setNewCourse({ semester: parseInt(selectedSemester) || 1, credit: 3 });
      fetchData();
    } else {
      setMessage(`Error: ${error.message}`);
    }
    setTimeout(() => setMessage(''), 3000);
  };

  // --- 2. EXPORT GRADING SHEET (CSV) ---
  const exportGradingSheet = () => {
    if (!currentCourseDetails) return alert("Select a course first.");
    
    const maxCTs = currentCourseDetails.credit === 2 ? 3 : 4;
    let csvContent = `College ID,Name,CT1,CT2,CT3${maxCTs === 4 ? ',CT4' : ''}\n`;

    displayedStudents.forEach(student => {
      csvContent += `${student.college_id},${student.name},0,0,0${maxCTs === 4 ? ',0' : ''}\n`;
    });

    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement('a');
    link.href = encodedUri;
    link.download = `${currentCourseDetails.course_code}_Grading_Sheet.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 3. DIRECT EMAIL WORKFLOW ---
  const handleEmailRoster = async () => {
    if (!currentCourseDetails) return alert("Select a course first.");
    if (!currentCourseDetails.teacher_email) return alert("This course does not have a valid teacher email assigned.");
    
    setIsSendingEmail(true);
    setMessage(`Preparing to email ${currentCourseDetails.teacher_name}...`);

    const maxCTs = currentCourseDetails.credit === 2 ? 3 : 4;
    let csvContent = `College ID,Name,CT1,CT2,CT3${maxCTs === 4 ? ',CT4' : ''}\n`;
    displayedStudents.forEach(student => {
      csvContent += `${student.college_id},${student.name},0,0,0${maxCTs === 4 ? ',0' : ''}\n`;
    });

    try {
      const response = await fetch('/api/academic/send-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherEmail: currentCourseDetails.teacher_email,
          teacherName: currentCourseDetails.teacher_name,
          courseCode: currentCourseDetails.course_code,
          courseName: currentCourseDetails.course_name,
          csvData: csvContent
        })
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
      } else {
        setMessage(result.error || 'Failed to send email.');
      }
    } catch (error) {
      setMessage('Server error while sending email.');
    } finally {
      setIsSendingEmail(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // --- 4. IMPORT GRADES (CSV PARSER) ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentCourseDetails) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = text.split('\n').filter(row => row.trim() !== ''); 
      
      let uploadCount = 0;
      
      for (let i = 1; i < rows.length; i++) {
        const columns = rows[i].split(',');
        const collegeId = columns[0]?.trim();
        const student = students.find(s => s.college_id === collegeId);
        
        if (student) {
          await supabase.from('ct_marks').upsert({
            student_id: student.id,
            course_code: currentCourseDetails.course_code,
            ct1: parseFloat(columns[2]) || 0,
            ct2: parseFloat(columns[3]) || 0,
            ct3: parseFloat(columns[4]) || 0,
            ct4: currentCourseDetails.credit === 3 ? (parseFloat(columns[5]) || 0) : 0
          }, { onConflict: 'student_id,course_code' });
          uploadCount++;
        }
      }
      setMessage(`Successfully imported grades for ${uploadCount} students.`);
      fetchData(); 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      setTimeout(() => setMessage(''), 5000);
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Academic Coordination</h1>
        <p className="text-gray-600">Teacher 3 Portal | Department of CSE</p>
      </header>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Class Progress Ledger</h2>
            {message && <p className="text-sm text-green-600 mt-1 font-medium">{message}</p>}
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Batch:</label>
              <select
                value={selectedSemester}
                onChange={(e) => {
                  setSelectedSemester(e.target.value);
                  setSelectedCourseCode('');
                }}
                className="border border-gray-300 rounded-md p-2 text-sm text-gray-700 bg-white"
              >
                <option value="All">All Semesters</option>
                {[1,2,3,4,5,6,7,8].map(num => <option key={num} value={num}>{num} Semester</option>)}
              </select>
            </div>

            {activeTab === 'ct_marks' && selectedSemester !== 'All' && (
              <div className="flex items-center space-x-2 border-l border-gray-300 pl-4">
                <label className="text-sm font-medium text-indigo-700">Subject:</label>
                <select
                  value={selectedCourseCode}
                  onChange={(e) => setSelectedCourseCode(e.target.value)}
                  className="border border-indigo-300 rounded-md p-2 text-sm text-indigo-800 bg-indigo-50 font-medium"
                >
                  <option value="">-- Select Course --</option>
                  {availableCourses.map(course => (
                    <option key={course.course_code} value={course.course_code}>
                      {course.course_code}: {course.course_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* View Toggle Buttons */}
        <div className="flex space-x-2 mb-6 border-b border-gray-200 pb-4">
          <button onClick={() => setActiveTab('attendance')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'attendance' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>📋 Attendance Mgt</button>
          <button onClick={() => setActiveTab('ct_marks')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'ct_marks' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>📝 CT Marks Mgt</button>
          <button onClick={() => setActiveTab('curriculum')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'curriculum' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>⚙️ Curriculum & Faculty</button>
        </div>
        
        {/* TAB 1 & 2: ATTENDANCE OR CT MARKS */}
        {(activeTab === 'attendance' || activeTab === 'ct_marks') && (
          <>
            {/* CSV Automation Toolbar (Only on CT Marks) */}
            {activeTab === 'ct_marks' && selectedCourseCode && (
              <div className="flex flex-wrap justify-between items-center bg-indigo-50 p-4 rounded-lg mb-4 border border-indigo-100 gap-4">
                <div>
                  <h3 className="text-sm font-bold text-indigo-800">Teacher Grading Workflow</h3>
                  <p className="text-xs text-indigo-600">Coordinate roster for {currentCourseDetails?.teacher_name} ({currentCourseDetails?.teacher_email})</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={exportGradingSheet} 
                    className="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded text-sm font-medium hover:bg-indigo-100"
                  >
                    ⬇️ Download CSV
                  </button>
                  
                  <button 
                    onClick={handleEmailRoster} 
                    disabled={isSendingEmail}
                    className="px-3 py-1.5 bg-indigo-100 border border-indigo-300 text-indigo-800 rounded text-sm font-medium hover:bg-indigo-200 disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    {isSendingEmail ? 'Sending...' : '📧 Email to Teacher'}
                  </button>

                  <label className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 cursor-pointer shadow-sm">
                    ⬆️ Upload Filled CSV
                    <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {activeTab === 'attendance' ? (
                    <tr className="bg-gray-100 border-b">
                      <th className="p-3 text-sm font-medium text-gray-600">ID</th>
                      <th className="p-3 text-sm font-medium text-gray-600">Name</th>
                      <th className="p-3 text-sm font-medium text-gray-600">Attendance (%)</th>
                      <th className="p-3 text-sm font-medium text-gray-600">Status</th>
                      <th className="p-3 text-sm font-medium text-gray-600">Action</th>
                    </tr>
                  ) : (
                    <tr className="bg-indigo-50 border-b">
                      <th className="p-3 text-sm font-medium text-indigo-800">ID</th>
                      <th className="p-3 text-sm font-medium text-indigo-800">Name</th>
                      <th className="p-3 text-sm font-medium text-indigo-800 w-24">CT-1</th>
                      <th className="p-3 text-sm font-medium text-indigo-800 w-24">CT-2</th>
                      <th className="p-3 text-sm font-medium text-indigo-800 w-24">CT-3</th>
                      <th className="p-3 text-sm font-medium text-indigo-800 w-24">CT-4</th>
                      <th className="p-3 text-sm font-medium text-indigo-800">Action</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {displayedStudents.map((student) => {
                    const edits = editValues[student.id] || {};
                    const isTwoCredit = currentCourseDetails?.credit === 2;
                    const maxMarks = isTwoCredit ? 10 : 15;
                    const ctInputClass = "w-full border border-gray-300 rounded p-1 text-sm font-medium text-center focus:ring-indigo-500";

                    return (
                      <tr key={student.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-sm text-gray-900">{student.college_id}</td>
                        <td className="p-3 text-sm font-medium text-gray-900">{student.name}</td>
                        {activeTab === 'attendance' ? (
                          <>
                            <td className="p-3 text-sm">
                              <input 
                                type="number" min="0" max="100"
                                value={edits.attendance_percentage ?? ''}
                                onChange={(e) => handleInputChange(student.id, 'attendance_percentage', parseInt(e.target.value) || 0)}
                                className={`w-full border rounded p-1 text-sm font-medium ${
                                  (edits.attendance_percentage || 0) < 75 ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-300 text-gray-900'
                                }`}
                              />
                            </td>
                            <td className="p-3 text-sm">
                              <select 
                                value={edits.internal_marks_status ?? 'Pending'}
                                onChange={(e) => handleInputChange(student.id, 'internal_marks_status', e.target.value)}
                                className={`text-sm border rounded p-1 font-medium ${
                                  edits.internal_marks_status === 'Submitted' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                                }`}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Submitted">Submitted</option>
                              </select>
                            </td>
                            <td className="p-3 text-sm">
                              <button onClick={() => handleSaveAttendance(student.id, student.name)} disabled={isSaving === student.id} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-400">
                                {isSaving === student.id ? 'Saving...' : 'Save'}
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 text-sm">
                              <input type="number" min="0" max={maxMarks} value={edits.ct1 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct1', parseFloat(e.target.value) || 0)} className={ctInputClass} />
                            </td>
                            <td className="p-3 text-sm">
                              <input type="number" min="0" max={maxMarks} value={edits.ct2 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct2', parseFloat(e.target.value) || 0)} className={ctInputClass} />
                            </td>
                            <td className="p-3 text-sm">
                              <input type="number" min="0" max={maxMarks} value={edits.ct3 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct3', parseFloat(e.target.value) || 0)} className={ctInputClass} />
                            </td>
                            <td className="p-3 text-sm">
                              {!isTwoCredit ? (
                                <input type="number" min="0" max={maxMarks} value={edits.ct4 ?? ''} onChange={(e) => handleInputChange(student.id, 'ct4', parseFloat(e.target.value) || 0)} className={ctInputClass} />
                              ) : (
                                <span className="text-gray-400 text-xs flex justify-center italic">N/A</span>
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              <button onClick={() => handleSaveCTMarks(student.id, student.name)} disabled={isSaving === student.id} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:bg-gray-400">
                                {isSaving === student.id ? 'Saving...' : 'Save'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {displayedStudents.length === 0 && (
                    <tr>
                      <td colSpan={activeTab === 'attendance' ? 5 : 7} className="p-6 text-center text-gray-500 text-sm">
                        No students found for this semester.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB 3: CURRICULUM MANAGEMENT */}
        {activeTab === 'curriculum' && (
          <div className="space-y-8">
            <div className="bg-purple-50 p-6 rounded-lg border border-purple-100">
              <h3 className="text-lg font-bold text-purple-900 mb-4">Assign New Course & Teacher</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-purple-700 mb-1">Semester</label>
                  <select value={newCourse.semester} onChange={(e) => setNewCourse({...newCourse, semester: parseInt(e.target.value)})} className="w-full border rounded p-2 text-sm bg-white">
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-700 mb-1">Course Code</label>
                  <input type="text" placeholder="e.g. CSE-3101" value={newCourse.course_code || ''} onChange={(e) => setNewCourse({...newCourse, course_code: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-700 mb-1">Course Name</label>
                  <input type="text" placeholder="e.g. Data Structures" value={newCourse.course_name || ''} onChange={(e) => setNewCourse({...newCourse, course_name: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-700 mb-1">Credits</label>
                  <select value={newCourse.credit} onChange={(e) => setNewCourse({...newCourse, credit: parseInt(e.target.value)})} className="w-full border rounded p-2 text-sm bg-white">
                    <option value={2}>2 Credits (3 CTs)</option>
                    <option value={3}>3 Credits (4 CTs)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-700 mb-1">Teacher Name</label>
                  <input type="text" placeholder="Prof. Jane Doe" value={newCourse.teacher_name || ''} onChange={(e) => setNewCourse({...newCourse, teacher_name: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-700 mb-1">Teacher Email</label>
                  <input type="email" placeholder="jane@imperial.edu" value={newCourse.teacher_email || ''} onChange={(e) => setNewCourse({...newCourse, teacher_email: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
              </div>
              <button onClick={handleCreateCourse} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded font-medium hover:bg-purple-700">Add Course to Catalog</button>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Active Course Catalog</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map(c => (
                  <div key={c.id} className="p-4 border rounded shadow-sm bg-white flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sem {c.semester}</span>
                      <h4 className="font-bold text-indigo-900">{c.course_code}: {c.course_name}</h4>
                      <p className="text-sm text-gray-600">{c.teacher_name} ({c.teacher_email})</p>
                    </div>
                    <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-medium">{c.credit} Cr</span>
                  </div>
                ))}
                {courses.length === 0 && (
                  <p className="text-sm text-gray-500 col-span-2">No courses created yet. Use the form above to build your curriculum.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}