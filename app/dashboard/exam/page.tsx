'use client'; 

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';

type ExamStudent = {
  id: string;
  college_id: string;
  ru_id: string;
  name: string;
  semester: number;
  exam_reg_status: string;
  backlogs: number;
  internal_marks_status: string;
  attendance_percentage: number;
};

export default function ExaminationDashboard() {
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>('All');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState('');

  const fetchExamData = async () => {
    const { data, error } = await supabase
      .from('master_students')
      .select('id, college_id, ru_id, name, semester, exam_reg_status, backlogs, internal_marks_status, attendance_percentage')
      .order('college_id', { ascending: true });

    if (!error && data) setStudents(data as ExamStudent[]);
  };

  useEffect(() => { fetchExamData(); }, []);

  const displayedStudents = selectedSemester === 'All' 
    ? students 
    : students.filter(s => s.semester.toString() === selectedSemester);

  const updateExamStatus = async (uuid: string, newStatus: string) => {
    setIsUpdating(uuid);
    const { error } = await supabase
      .from('master_students')
      .update({ exam_reg_status: newStatus })
      .eq('id', uuid);

    if (!error) fetchExamData();
    else alert('Failed to update status');
    setIsUpdating(null);
  };

  const handleCheckEligibility = async () => {
    setIsChecking(true);
    setMessage('Cross-referencing fees and attendance...');

    try {
      const response = await fetch('/api/exams/check-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester: selectedSemester })
      });
      
      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchExamData(); 
      } else {
        setMessage(result.error || 'Check failed.');
      }
    } catch (error) {
      setMessage('Server error.');
    } finally {
      setIsChecking(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const totalEligible = displayedStudents.length;
  const regCompleted = displayedStudents.filter(s => s.exam_reg_status === 'Done').length;
  const regPending = displayedStudents.filter(s => s.exam_reg_status === 'Pending').length;
  const regBlocked = displayedStudents.filter(s => s.exam_reg_status === 'Blocked').length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Examination & Assessment</h1>
        <p className="text-gray-600">Teacher 2 Portal | Department of CSE</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total Candidates</h3>
          <p className="text-2xl font-bold text-gray-900">{totalEligible}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-green-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Reg. Completed</h3>
          <p className="text-2xl font-bold text-green-700">{regCompleted}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-yellow-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Incomplete Reg.</h3>
          <p className="text-2xl font-bold text-yellow-700">{regPending}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-red-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Eligibility Issues</h3>
          <p className="text-2xl font-bold text-red-700">{regBlocked}</p>
          <p className="text-xs text-gray-500 mt-1">Blocked by System/HOD</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Exam Registration Ledger</h2>
            {message && <p className="text-sm text-green-600 mt-1">{message}</p>}
          </div>
          
          <div className="flex items-center space-x-3">
            <label htmlFor="semester-filter" className="text-sm font-medium text-gray-700">Filter Batch:</label>
            <select
              id="semester-filter"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="border border-gray-300 rounded-md p-2 text-sm text-gray-700 bg-white"
            >
              <option value="All">All Semesters</option>
              {[1,2,3,4,5,6,7,8].map(num => (
                <option key={num} value={num}>{num}{num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'} Semester</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex space-x-2 mb-4 p-4 bg-gray-50 rounded-md border border-gray-100">
            <span className="text-sm font-medium text-gray-600 mr-2 self-center">Exam Workflows:</span>
            <button 
              onClick={handleCheckEligibility}
              disabled={isChecking}
              className="px-4 py-2 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm disabled:bg-gray-400"
            >
              {isChecking ? 'Checking...' : '🔍 Auto-Check Eligibility'}
            </button>
            <button className="px-4 py-2 rounded text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
              📄 Generate Admit Cards
            </button>
            <button className="px-4 py-2 rounded text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm">
              📊 Coordinate Tabulation
            </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3 text-sm font-medium text-gray-600">College ID</th>
                <th className="p-3 text-sm font-medium text-gray-600">RU ID</th>
                <th className="p-3 text-sm font-medium text-gray-600">Name</th>
                {/* NEW: Attendance Header */}
                <th className="p-3 text-sm font-medium text-gray-600">Attendance</th>
                <th className="p-3 text-sm font-medium text-gray-600">Exam Reg.</th>
                <th className="p-3 text-sm font-medium text-gray-600">Backlogs</th>
                <th className="p-3 text-sm font-medium text-gray-600">Internal Marks</th>
                <th className="p-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedStudents.map((student) => (
                <tr key={student.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm text-gray-900">{student.college_id}</td>
                  <td className="p-3 text-sm text-gray-900">{student.ru_id || 'N/A'}</td>
                  <td className="p-3 text-sm font-medium text-gray-900">{student.name}</td>
                  
                  {/* NEW: Attendance Data Cell with Color Coding */}
                  <td className="p-3 text-sm">
                    <span className={`font-medium ${student.attendance_percentage < 75 ? 'text-red-600' : 'text-green-600'}`}>
                      {student.attendance_percentage}%
                    </span>
                  </td>

                  <td className="p-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      student.exam_reg_status === 'Done' ? 'bg-green-100 text-green-800' :
                      student.exam_reg_status === 'Blocked' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {student.exam_reg_status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-900">{student.backlogs}</td>
                  <td className="p-3 text-sm">
                    <span className={`font-medium ${student.internal_marks_status === 'Submitted' ? 'text-green-600' : 'text-yellow-600'}`}>
                      {student.internal_marks_status}
                    </span>
                  </td>
                  <td className="p-3 text-sm">
                    <div className="flex space-x-2">
                      <select 
                        value={student.exam_reg_status}
                        disabled={isUpdating === student.id}
                        onChange={(e) => updateExamStatus(student.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded p-1 bg-white text-gray-900"
                      >
                        <option value="Pending">Set Pending</option>
                        <option value="Done">Verify Form</option>
                        <option value="Blocked">Block Student</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
              {displayedStudents.length === 0 && (
                <tr>
                  {/* Increased colSpan to 8 to account for the new column */}
                  <td colSpan={8} className="p-6 text-center text-gray-500 text-sm">
                    No students found for this semester.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}