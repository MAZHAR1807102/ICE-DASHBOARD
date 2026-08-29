'use client'; 

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';

type Student = {
  id: string;
  college_id: string;
  name: string;
  advisor: string;
  attendance_percentage: number;
  exam_reg_status: string;
  backlogs: number;
};

type FeeSummary = {
  college_id: string;
  total_outstanding_due: number;
};

export default function HODDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [feeData, setFeeData] = useState<FeeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDepartmentData = async () => {
      setIsLoading(true);
      
      // Fetch academic & exam data
      const { data: studentRecords } = await supabase
        .from('master_students')
        .select('id, college_id, name, advisor, attendance_percentage, exam_reg_status, backlogs');
        
      // Fetch financial data
      const { data: financialRecords } = await supabase
        .from('student_fee_summary')
        .select('college_id, total_outstanding_due');

      if (studentRecords) setStudents(studentRecords as Student[]);
      if (financialRecords) setFeeData(financialRecords as FeeSummary[]);
      
      setIsLoading(false);
    };

    fetchDepartmentData();
  }, []);

  // --- Department-Wide Autonomous Calculations ---
  const totalStudents = students.length;
  
  // Financial Issues (Teacher 1)
  const pendingFeesCount = feeData.filter(f => Number(f.total_outstanding_due) > 0).length;
  
  // Exam Issues (Teacher 2)
  const examIssuesCount = students.filter(s => s.exam_reg_status === 'Blocked').length;
  
  // Academic & Risk Issues (Teacher 3 & Advisors)
  // We classify "High Risk" as < 60% attendance OR having 3+ backlogs
  const highRiskStudents = students.filter(s => s.attendance_percentage < 60 || s.backlogs >= 3);
  const highRiskCount = highRiskStudents.length;

  // Compile the Level 3 Escalation List for the HOD
  const escalatedCases = students.filter(s => {
    const finances = feeData.find(f => f.college_id === s.college_id);
    const hasSevereDebt = finances && Number(finances.total_outstanding_due) > 15000;
    const isBlocked = s.exam_reg_status === 'Blocked';
    const isFailing = s.backlogs >= 3;
    
    return hasSevereDebt || isBlocked || isFailing;
  });

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center text-gray-500">Loading department data...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 relative">
      {/* Header Section */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">HOD Overview</h1>
        <p className="text-gray-600">Department of CSE | Imperial College of Engineering</p>
      </header>

      {/* Top Level Metrics (Aggregated from Coordinators) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <MetricCard title="Total Students" value={totalStudents.toString()} alert={false} />
        <MetricCard title="Accounts Pending" value={pendingFeesCount.toString()} alert={pendingFeesCount > 0} subtitle="Requires T1 follow-up" />
        <MetricCard title="Exam Blocks" value={examIssuesCount.toString()} alert={examIssuesCount > 0} subtitle="Requires T2 clearance" />
        <MetricCard title="High Risk Students" value={highRiskCount.toString()} alert={highRiskCount > 0} subtitle="Attendance/CGPA Drop" />
      </div>

      {/* Escalated Issues & Exceptional Cases */}
      <div className="bg-white rounded-lg shadow p-6 mb-8 border border-red-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-red-700">Level 3 Escalations (Action Required)</h2>
          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded font-bold">{escalatedCases.length} Pending Reviews</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-3 text-sm font-medium text-gray-600">ID</th>
                <th className="p-3 text-sm font-medium text-gray-600">Name</th>
                <th className="p-3 text-sm font-medium text-gray-600">Advisor</th>
                <th className="p-3 text-sm font-medium text-gray-600">Primary Trigger</th>
                <th className="p-3 text-sm font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {escalatedCases.map((student) => {
                const finances = feeData.find(f => f.college_id === student.college_id);
                const debt = Number(finances?.total_outstanding_due || 0);
                
                // Determine the primary reason they are on the HOD's desk
                let trigger = '';
                if (student.exam_reg_status === 'Blocked') trigger = 'Exam Blocked (T2)';
                else if (debt > 15000) trigger = `Severe Debt (${debt} Tk)`;
                else if (student.backlogs >= 3) trigger = `Academic Failure (${student.backlogs} Backlogs)`;

                return (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-900">{student.college_id}</td>
                    <td className="p-3 font-medium text-gray-900">{student.name}</td>
                    <td className="p-3 text-sm text-gray-600">{student.advisor}</td>
                    <td className="p-3 text-sm text-red-600 font-medium">{trigger}</td>
                    <td className="p-3 text-sm">
                      <button className="text-blue-600 hover:underline font-medium">Review Case</button>
                    </td>
                  </tr>
                );
              })}
              {escalatedCases.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-green-600 text-sm font-medium">
                    No Level 3 escalations at this time. Department is operating smoothly.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Departmental Status Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Academic Progress (Teacher 3)</h2>
          <p className="text-sm text-gray-600">Syllabus completion and overall teaching progress is currently being tracked by the Academic Coordination portal.</p>
          <button className="mt-4 text-sm text-indigo-600 font-medium hover:underline">View Academic Reports &rarr;</button>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Department Administration</h2>
          <p className="text-sm text-gray-600">System architecture enforcing autonomous 3-level escalation workflows.</p>
          <button className="mt-4 text-sm text-indigo-600 font-medium hover:underline">Manage Faculty Access &rarr;</button>
        </div>
      </div>
    </div>
  );
}

// Reusable Metric Card Component
function MetricCard({ title, value, alert, subtitle }: { title: string, value: string, alert: boolean, subtitle?: string }) {
  return (
    <div className={`p-6 rounded-lg shadow border-l-4 ${alert ? 'bg-red-50 border-red-500' : 'bg-white border-blue-500'}`}>
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <p className={`text-3xl font-bold ${alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
    </div>
  );
}