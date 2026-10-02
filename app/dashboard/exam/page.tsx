'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../../utils/eligibility';
import { SEMESTERS, type Student } from '../../../utils/types';
import PortalHeader from '../../components/PortalHeader';
import PublishResultsModal from './_components/PublishResultsModal';

type ExamStudent = Pick<Student, 'id' | 'college_id' | 'ru_id' | 'name' | 'semester' | 'exam_reg_status' | 'backlogs' | 'internal_marks_status' | 'attendance_percentage'>;

const STATUS_STYLE: Record<string, string> = {
  Done: 'bg-green-100 text-green-800',
  Blocked: 'bg-red-100 text-red-800',
};

export default function ExaminationDashboard() {
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [isPublishOpen, setIsPublishOpen] = useState(false);

  const fetchExamData = useCallback(() =>
    supabase
      .from('master_students')
      .select('id, college_id, ru_id, name, semester, exam_reg_status, backlogs, internal_marks_status, attendance_percentage')
      .order('college_id', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setStudents(data as ExamStudent[]);
      }), []);

  useEffect(() => {
    fetchExamData();
  }, [fetchExamData]);

  const updateExamStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    const { error } = await supabase.from('master_students').update({ exam_reg_status: status }).eq('id', id);
    setUpdatingId(null);
    if (error) return alert('Failed to update status');
    fetchExamData();
  };

  const handleCheckEligibility = async () => {
    setIsChecking(true);
    setMessage('Cross-referencing fees and attendance...');
    try {
      const response = await fetch('/api/exams/check-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester: selectedSemester }),
      });
      const result = await response.json();
      setMessage(response.ok ? result.message : result.error || result.message || 'Check failed.');
      if (response.ok) fetchExamData();
    } catch {
      setMessage('Server error.');
    } finally {
      setIsChecking(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const displayedStudents = selectedSemester === 'All' ? students : students.filter((s) => s.semester.toString() === selectedSemester);
  const countBy = (status: string) => displayedStudents.filter((s) => s.exam_reg_status === status).length;

  const cards = [
    { title: 'Total Candidates', value: displayedStudents.length, style: 'border-blue-500 text-gray-900' },
    { title: 'Reg. Completed', value: countBy('Done'), style: 'border-green-500 text-green-700' },
    { title: 'Incomplete Reg.', value: countBy('Pending'), style: 'border-yellow-500 text-yellow-700' },
    { title: 'Eligibility Issues', value: countBy('Blocked'), style: 'border-red-500 text-red-700', note: 'Blocked by System/HOD' },
  ];

  return (
    <div className="min-h-screen bg-[#f4f7f9] p-6 lg:p-10 font-sans text-slate-800">
      <PortalHeader title="Examination & Assessment" accent="purple" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div key={card.title} className={`bg-white rounded-lg shadow p-6 border-t-4 ${card.style}`}>
            <h3 className="text-sm font-medium text-gray-500 mb-1">{card.title}</h3>
            <p className="text-2xl font-bold">{card.value}</p>
            {card.note && <p className="text-xs text-gray-500 mt-1">{card.note}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Exam Registration Ledger</h2>
            {message && <p className="text-sm text-green-600 mt-1">{message}</p>}
          </div>
          <div className="flex items-center space-x-3">
            <label htmlFor="semester-filter" className="text-sm font-medium text-gray-700">Filter Batch:</label>
            <select id="semester-filter" value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="border border-gray-300 rounded-md p-2 text-sm text-gray-700 bg-white">
              <option value="All">All Semesters</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 p-4 bg-gray-50 rounded-md border border-gray-100">
          <span className="text-sm font-medium text-gray-600 mr-2 self-center">Exam Workflows:</span>
          <button onClick={handleCheckEligibility} disabled={isChecking} className="px-4 py-2 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm disabled:bg-gray-400">
            {isChecking ? 'Checking...' : '🔍 Auto-Check Eligibility'}
          </button>
          <button disabled title="Coming soon" className="px-4 py-2 rounded text-sm font-medium text-gray-500 bg-gray-200 cursor-not-allowed">📄 Generate Admit Cards (coming soon)</button>
          <button onClick={() => setIsPublishOpen(true)} className="px-4 py-2 rounded text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 shadow-sm">📊 Publish Results</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                {['College ID', 'RU ID', 'Name', 'Attendance', 'Exam Reg.', 'Backlogs', 'Internal Marks', 'Actions'].map((h) => (
                  <th key={h} className="p-3 text-sm font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedStudents.map((student) => {
                const attendance = student.attendance_percentage || 0;
                const status = student.exam_reg_status || 'Pending';
                return (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-900">{student.college_id}</td>
                    <td className="p-3 text-sm text-gray-900">{student.ru_id || 'N/A'}</td>
                    <td className="p-3 text-sm font-medium text-gray-900">{student.name}</td>
                    <td className="p-3 text-sm">
                      <span className={`font-medium ${attendance < MIN_ATTENDANCE_PERCENT ? 'text-red-600' : 'text-green-600'}`}>{attendance}%</span>
                    </td>
                    <td className="p-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLE[status] ?? 'bg-yellow-100 text-yellow-800'}`}>{status}</span>
                    </td>
                    <td className="p-3 text-sm text-gray-900">{student.backlogs ?? 0}</td>
                    <td className="p-3 text-sm">
                      <span className={`font-medium ${student.internal_marks_status === 'Submitted' ? 'text-green-600' : 'text-yellow-600'}`}>{student.internal_marks_status}</span>
                    </td>
                    <td className="p-3 text-sm">
                      <select value={status} disabled={updatingId === student.id} onChange={(e) => updateExamStatus(student.id, e.target.value)} className="text-xs border border-gray-300 rounded p-1 bg-white text-gray-900">
                        <option value="Pending">Set Pending</option>
                        <option value="Done">Verify Form</option>
                        <option value="Blocked">Block Student</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
              {displayedStudents.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-gray-500 text-sm">No students found for this semester.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isPublishOpen && (
        <PublishResultsModal
          students={students}
          onClose={() => setIsPublishOpen(false)}
          onPublished={(msg) => { setIsPublishOpen(false); setMessage(msg); fetchExamData(); setTimeout(() => setMessage(''), 5000); }}
        />
      )}
    </div>
  );
}
