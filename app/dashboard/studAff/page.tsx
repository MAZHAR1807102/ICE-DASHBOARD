'use client'; 

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase';

type StudentFeeSummary = {
  college_id: string;
  ru_id: string;
  name: string;
  semester: number;
  monthly_due: number;
  semester_due: number;
  ru_exam_due: number;
  total_outstanding_due: number;
};

export default function StudentAffairsDashboard() {
  const [students, setStudents] = useState<StudentFeeSummary[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>('All');
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const [editingStudent, setEditingStudent] = useState<StudentFeeSummary | null>(null);
  const [newRates, setNewRates] = useState({ monthly: '', semester: '', ru: '' });
  
  const [payingStudent, setPayingStudent] = useState<StudentFeeSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState('Monthly');
  
  const [isSaving, setIsSaving] = useState(false);

  const fetchFeeData = async () => {
    const { data, error } = await supabase
      .from('student_fee_summary')
      .select('*')
      .order('college_id', { ascending: true });

    if (!error && data) setStudents(data as StudentFeeSummary[]);
  };

  useEffect(() => { fetchFeeData(); }, []);

  const displayedStudents = selectedSemester === 'All' 
    ? students 
    : students.filter(s => s.semester.toString() === selectedSemester);

  const handleGenerateFees = async (apiRoute: string, type: string) => {
    setLoadingType(type);
    const targetText = selectedSemester === 'All' ? 'ALL students' : `Semester ${selectedSemester}`;
    setMessage(`Generating ${type} fees for ${targetText}...`);

    try {
      const response = await fetch(apiRoute, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester: selectedSemester })
      });
      
      const result = await response.json();
      if (response.ok) {
        setMessage(result.message);
        fetchFeeData(); 
      } else {
        setMessage(result.error || 'Something went wrong.');
      }
    } catch (error) {
      setMessage('Failed to reach the server.');
    } finally {
      setLoadingType(null);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const openConfigModal = (student: StudentFeeSummary) => {
    setEditingStudent(student);
    setNewRates({ monthly: '2200', semester: '6875', ru: '10000' });
  };

  const openPaymentModal = (student: StudentFeeSummary) => {
    setPayingStudent(student);
    setPaymentAmount('');
    setPaymentType('Monthly');
  };

  const handleSaveRates = async () => {
    if (!editingStudent) return;
    setIsSaving(true);

    const { error } = await supabase
      .from('master_students')
      .update({
        agreed_monthly_fee: parseFloat(newRates.monthly) || 0,
        agreed_semester_fee: parseFloat(newRates.semester) || 0,
        agreed_ru_exam_fee: parseFloat(newRates.ru) || 0,
      })
      .eq('college_id', editingStudent.college_id);

    if (error) alert('Error updating fee rates: ' + error.message);
    else {
      alert(`Fee rates successfully updated for ${editingStudent.name}`);
      setEditingStudent(null);
    }
    setIsSaving(false);
  };

  const handleLogPayment = async () => {
    if (!payingStudent || !paymentAmount) return;
    setIsSaving(true);
    
    const { data: studentRecord } = await supabase
      .from('master_students')
      .select('id')
      .eq('college_id', payingStudent.college_id)
      .single();

    if (studentRecord) {
      const { data: ledgerEntries } = await supabase
        .from('fee_ledger')
        .select('*')
        .eq('student_uuid', studentRecord.id)
        .eq('fee_type', paymentType)
        .order('created_at', { ascending: true });

      const unpaidLedger = ledgerEntries?.find(
        (entry) => parseFloat(entry.total_required) > parseFloat(entry.amount_paid)
      );

      if (unpaidLedger) {
        const newPaidTotal = parseFloat(unpaidLedger.amount_paid) + parseFloat(paymentAmount);

        const { error: updateError } = await supabase
          .from('fee_ledger')
          .update({ amount_paid: newPaidTotal })
          .eq('id', unpaidLedger.id);

        if (!updateError) {
          alert(`Payment of ${paymentAmount} Tk logged for ${payingStudent.name}.`);
          setPayingStudent(null);
          fetchFeeData(); 
        } else {
          alert('Error logging payment: ' + updateError.message);
        }
      } else {
         alert(`No outstanding ${paymentType} dues found for ${payingStudent.name}.`);
      }
    }
    setIsSaving(false);
  };

  // --- Export Functions ---
  const exportToExcel = () => {
    const headers = ['College ID', 'RU ID', 'Name', 'Semester', 'Monthly Due', 'Sem Due', 'RU Exam', 'Total Due'];
    const rows = displayedStudents.map(s => [
      s.college_id,
      s.ru_id || 'N/A',
      s.name,
      s.semester,
      s.monthly_due,
      s.semester_due,
      s.ru_exam_due,
      s.total_outstanding_due
    ]);

    let csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Fee_Ledger_Semester_${selectedSemester}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToWord = () => {
    let htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>Fee Ledger</title><style>body{font-family:Arial;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;}</style></head>
      <body>
        <h2>Department of CSE - Fee Ledger (Semester ${selectedSemester})</h2>
        <table>
          <tr><th>College ID</th><th>RU ID</th><th>Name</th><th>Semester</th><th>Monthly Due</th><th>Sem Due</th><th>RU Exam</th><th>Total Due</th></tr>
          ${displayedStudents.map(s => `<tr><td>${s.college_id}</td><td>${s.ru_id || 'N/A'}</td><td>${s.name}</td><td>${s.semester}</td><td>${s.monthly_due}</td><td>${s.semester_due}</td><td>${s.ru_exam_due}</td><td>${s.total_outstanding_due}</td></tr>`).join('')}
        </table>
      </body></html>
    `;
    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Fee_Ledger_Semester_${selectedSemester}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printPDF = () => {
    window.print();
  };

  // Metrics
  const totalStudents = displayedStudents.length;
  const feesCleared = displayedStudents.filter(s => s.total_outstanding_due === 0).length;
  const feesPending = totalStudents - feesCleared;
  const totalDepartmentDue = displayedStudents.reduce((sum, student) => sum + Number(student.total_outstanding_due || 0), 0);
  const totalMonthlyDue = displayedStudents.reduce((sum, student) => sum + Number(student.monthly_due || 0), 0);
  const totalSemesterDue = displayedStudents.reduce((sum, student) => sum + Number(student.semester_due || 0), 0);
  const totalRuDue = displayedStudents.reduce((sum, student) => sum + Number(student.ru_exam_due || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8 relative">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-950">Student Affairs & Finance</h1>
        <p className="text-gray-600">Teacher 1 Portal | Department of CSE</p>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total Students</h3>
          <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-green-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Accounts Cleared</h3>
          <p className="text-2xl font-bold text-gray-900">{feesCleared}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-red-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Accounts Pending</h3>
          <p className="text-2xl font-bold text-red-700">{feesPending}</p>
        </div>
         <div className="bg-white rounded-lg shadow p-6 border-t-4 border-orange-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Grand Total Uncollected</h3>
          <p className="text-2xl font-bold text-orange-700">{totalDepartmentDue.toLocaleString()} Tk</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-5 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Monthly Dues Pending</h3>
          <p className="text-xl font-bold text-gray-800 mt-2">{totalMonthlyDue.toLocaleString()} Tk</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Semester Dues Pending</h3>
          <p className="text-xl font-bold text-gray-800 mt-2">{totalSemesterDue.toLocaleString()} Tk</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">RU Exam Dues Pending</h3>
          <p className="text-xl font-bold text-gray-800 mt-2">{totalRuDue.toLocaleString()} Tk</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Fee Management Ledger</h2>
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
        
        {/* Action Panel: Batch Billing & Export Options */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4 p-4 bg-gray-50 rounded-md border border-gray-100">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-600 mr-2 self-center">Billing:</span>
            <button onClick={() => handleGenerateFees('/api/fees/generate-monthly', 'Monthly')} disabled={loadingType !== null} className="px-3 py-1.5 rounded text-xs font-medium text-white bg-blue-600 hover:bg-blue-700">
              {loadingType === 'Monthly' ? '...' : '+ Monthly'}
            </button>
            <button onClick={() => handleGenerateFees('/api/fees/generate-semester', 'Semester')} disabled={loadingType !== null} className="px-3 py-1.5 rounded text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700">
              {loadingType === 'Semester' ? '...' : '+ Semester'}
            </button>
            <button onClick={() => handleGenerateFees('/api/fees/generate-ru', 'RU Exam')} disabled={loadingType !== null} className="px-3 py-1.5 rounded text-xs font-medium text-white bg-purple-600 hover:bg-purple-700">
              {loadingType === 'RU Exam' ? '...' : '+ RU Exam'}
            </button>
          </div>

          {/* Printable & Export Toolbar */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-600 mr-2 self-center">Export / Print:</span>
            <button onClick={exportToExcel} className="px-3 py-1.5 rounded text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 shadow-sm">
              📊 Excel (CSV)
            </button>
            <button onClick={exportToWord} className="px-3 py-1.5 rounded text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 shadow-sm">
              📄 Word (.doc)
            </button>
            <button onClick={printPDF} className="px-3 py-1.5 rounded text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 shadow-sm">
              🖨️ Print / Save PDF
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3 text-sm font-medium text-gray-600">College ID</th>
                <th className="p-3 text-sm font-medium text-gray-600">RU ID</th>
                <th className="p-3 text-sm font-medium text-gray-600">Name</th>
                <th className="p-3 text-sm font-medium text-gray-600">Sem.</th>
                <th className="p-3 text-sm font-medium text-gray-600">Monthly Due</th>
                <th className="p-3 text-sm font-medium text-gray-600">Sem. Due</th>
                <th className="p-3 text-sm font-medium text-gray-600">RU Exam</th>
                <th className="p-3 text-sm font-bold text-gray-800 bg-gray-200">Total Due</th>
                <th className="p-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedStudents.map((student) => (
                <tr key={student.college_id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm text-gray-900">{student.college_id}</td>
                  <td className="p-3 text-sm text-gray-900">{student.ru_id || 'N/A'}</td>
                  <td className="p-3 text-sm font-medium text-gray-900">{student.name}</td>
                  <td className="p-3 text-sm text-gray-900">{student.semester}</td>
                  <td className="p-3 text-sm text-red-600 font-medium">{student.monthly_due > 0 ? student.monthly_due : '-'}</td>
                  <td className="p-3 text-sm text-red-600 font-medium">{student.semester_due > 0 ? student.semester_due : '-'}</td>
                  <td className="p-3 text-sm text-red-600 font-medium">{student.ru_exam_due > 0 ? student.ru_exam_due : '-'}</td>
                  <td className="p-3 text-sm font-bold text-gray-900 bg-gray-50">
                    {student.total_outstanding_due > 0 ? student.total_outstanding_due : <span className="text-green-600">Cleared</span>}
                  </td>
                  <td className="p-3 text-sm">
                    <div className="flex space-x-2">
                       <button onClick={() => openPaymentModal(student)} className="text-green-600 hover:text-green-900 font-medium bg-green-50 border border-green-200 px-2 py-1 rounded text-xs">
                         Payment
                       </button>
                       <button onClick={() => openConfigModal(student)} className="text-indigo-600 hover:text-indigo-900 font-medium bg-indigo-50 border border-indigo-200 px-2 py-1 rounded text-xs">
                         Rates
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configuration Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Configure Base Rates</h3>
            <p className="text-sm text-gray-500 mb-4">Set agreed fee structure for {editingStudent.name}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Fee (Tk)</label>
                <input type="number" value={newRates.monthly} onChange={(e) => setNewRates({...newRates, monthly: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester Fee (Tk)</label>
                <input type="number" value={newRates.semester} onChange={(e) => setNewRates({...newRates, semester: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RU Exam Fee (Tk)</label>
                <input type="number" value={newRates.ru} onChange={(e) => setNewRates({...newRates, ru: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-gray-900" />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setEditingStudent(null)} className="px-4 py-2 border border-gray-300 rounded text-gray-700">Cancel</button>
              <button onClick={handleSaveRates} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded">{isSaving ? 'Saving...' : 'Save Settings'}</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Payment Modal */}
      {payingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold text-green-700 mb-1">Receive Payment</h3>
            <p className="text-sm text-gray-500 mb-4">Log cash/bank payment for {payingStudent.name}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment For</label>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-full border border-gray-300 rounded p-2 bg-white text-gray-900">
                  <option value="Monthly">Monthly</option>
                  <option value="Semester">Semester</option>
                  <option value="RU Exam">RU Exam</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (Tk)</label>
                <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full border border-green-500 rounded p-2 text-gray-900" placeholder="e.g. 2000" autoFocus />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setPayingStudent(null)} className="px-4 py-2 border border-gray-300 rounded text-gray-700">Cancel</button>
              <button onClick={handleLogPayment} disabled={isSaving || !paymentAmount} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                {isSaving ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}