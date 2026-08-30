'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../../utils/supabase';

export default function StudentAffairsPage() {
  // --- STATE MANAGEMENT ---
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState('Loading Faculty...');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'payment' | 'rates' | 'mass_bill' | null;
    student: any | null;
    billType: string | null;
  }>({ isOpen: false, type: null, student: null, billType: null });

  // --- INITIALIZATION: Fetch User & Live Data ---
  useEffect(() => {
    // 1. Get the logged-in teacher's details
    const session = localStorage.getItem('faculty_user');
    if (session) {
      const user = JSON.parse(session);
      setTeacherName(user.name);
    }

    // 2. Fetch the live student roster
    fetchStudents();
  }, []);

  async function fetchStudents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('master_students')
      .select('*')
      .order('college_id', { ascending: true });

    if (!error && data) {
      const formattedData = data.map(s => ({
        id: s.id,
        college_id: s.college_id,
        ru_id: s.ru_id || 'N/A',
        name: s.name,
        semester: s.semester,
        monthly_due: s.agreed_monthly_fee || 0,
        sem_due: s.agreed_semester_fee || 0,
        exam_due: s.agreed_ru_exam_fee || 0
      }));
      setStudents(formattedData);
    }
    setLoading(false);
  }

  // --- DERIVED METRICS & FILTERING ---
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            s.college_id.includes(searchQuery) || 
                            s.ru_id.includes(searchQuery);
      const matchesSem = semesterFilter === 'All' || s.semester.toString() === semesterFilter;
      return matchesSearch && matchesSem;
    });
  }, [students, searchQuery, semesterFilter]);

  const metrics = useMemo(() => {
    let totalMonthly = 0;
    let totalSemExam = 0;
    let clearedCount = 0;
    
    students.forEach(s => {
      totalMonthly += s.monthly_due;
      totalSemExam += (s.sem_due + s.exam_due);
      if (s.monthly_due === 0 && s.sem_due === 0 && s.exam_due === 0) clearedCount++;
    });

    return {
      totalStudents: students.length,
      cleared: clearedCount,
      pending: students.length - clearedCount,
      monthly: totalMonthly,
      semExam: totalSemExam,
      grandTotal: totalMonthly + totalSemExam
    };
  }, [students]);

  // --- MODAL HANDLERS ---
  const openModal = (type: 'payment' | 'rates' | 'mass_bill', student: any = null, billType: string | null = null) => {
    setModalConfig({ isOpen: true, type, student, billType });
  };

  const closeModal = () => setModalConfig({ isOpen: false, type: null, student: null, billType: null });

  return (
    <div className="min-h-screen bg-[#f4f7f9] p-6 lg:p-10 font-sans text-slate-800">
      
      {/* 1. Header with Dynamic Teacher Name */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-5">
          <div className="flex -space-x-3">
            <div className="w-14 h-14 rounded-full bg-white shadow-sm border-2 border-slate-200 flex items-center justify-center z-10 overflow-hidden">
              <span className="text-xs font-bold text-slate-400 text-center leading-tight">ICE<br/>Logo</span>
            </div>
            <div className="w-14 h-14 rounded-full bg-indigo-50 shadow-sm border-2 border-indigo-200 flex items-center justify-center z-0 overflow-hidden">
              <span className="text-[10px] font-bold text-indigo-500 text-center leading-tight">Dept<br/>Logo</span>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Student Affairs & Finance</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              {teacherName} | Department of CSE
            </p>
          </div>
        </div>
      </header>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Students</p>
          <p className="text-3xl font-black text-slate-800">{loading ? '...' : metrics.totalStudents}</p>
          <div className="flex space-x-3 mt-2 text-xs font-medium">
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{metrics.cleared} Cleared</span>
            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{metrics.pending} Pending</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Monthly Dues</p>
          <p className="text-2xl font-bold text-slate-800">{metrics.monthly.toLocaleString()} Tk</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Sem & Exam Dues</p>
          <p className="text-2xl font-bold text-slate-800">{metrics.semExam.toLocaleString()} Tk</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-rose-200 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -z-10"></div>
          <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">Grand Total Uncollected</p>
          <p className="text-3xl font-black text-rose-600">{metrics.grandTotal.toLocaleString()} Tk</p>
        </div>
      </div>

      {/* 3. Main Ledger */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col xl:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-slate-600 mr-2">Mass Billing:</span>
            <button onClick={() => openModal('mass_bill', null, 'Monthly')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ Monthly</button>
            <button onClick={() => openModal('mass_bill', null, 'Semester')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ Semester</button>
            <button onClick={() => openModal('mass_bill', null, 'RU Exam')} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ RU Exam</button>
          </div>

          <div className="flex items-center space-x-3 w-full xl:w-auto">
            <input 
              type="text" 
              placeholder="Search Name or ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full xl:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <select 
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none"
            >
              <option value="All">All Semesters</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
              <option value="3">Semester 3</option>
              <option value="4">Semester 4</option>
              <option value="5">Semester 5</option>
              <option value="6">Semester 6</option>
              <option value="7">Semester 7</option>
              <option value="8">Semester 8</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500 font-medium">Fetching real-time ledger...</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-bold text-slate-500">College ID</th>
                  <th className="px-6 py-4 font-bold text-slate-500">RU ID</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Name</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Sem.</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Monthly Due</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Sem. Due</th>
                  <th className="px-6 py-4 font-bold text-slate-500">RU Exam</th>
                  <th className="px-6 py-4 font-bold text-slate-800 bg-slate-50">Total Due</th>
                  <th className="px-6 py-4 font-bold text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => {
                  const totalDue = s.monthly_due + s.sem_due + s.exam_due;
                  const isCleared = totalDue === 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{s.college_id}</td>
                      <td className="px-6 py-4 text-slate-500">{s.ru_id}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">{s.name}</td>
                      <td className="px-6 py-4 text-slate-500">{s.semester}</td>
                      <td className={`px-6 py-4 font-medium ${s.monthly_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {s.monthly_due > 0 ? s.monthly_due : '-'}
                      </td>
                      <td className={`px-6 py-4 font-medium ${s.sem_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {s.sem_due > 0 ? s.sem_due : '-'}
                      </td>
                      <td className={`px-6 py-4 font-medium ${s.exam_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {s.exam_due > 0 ? s.exam_due : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold bg-slate-50">
                        {isCleared ? (
                          <span className="text-emerald-600 flex items-center">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>Cleared
                          </span>
                        ) : (
                          <span className="text-slate-900">{totalDue}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center space-x-2">
                          <button onClick={() => openModal('payment', s)} className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded text-xs font-bold transition-colors">
                            Payment
                          </button>
                          <button onClick={() => openModal('rates', s)} className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded text-xs font-bold transition-colors">
                            Rates
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && filteredStudents.length === 0 && (
            <div className="p-8 text-center text-slate-500">No students found matching your criteria.</div>
          )}
        </div>
      </div>

      {/* 4. Modal System */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">
                {modalConfig.type === 'payment' && 'Receive Payment'}
                {modalConfig.type === 'rates' && 'Update Financial Agreement'}
                {modalConfig.type === 'mass_bill' && `Mass Billing: ${modalConfig.billType}`}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700 font-bold text-xl">×</button>
            </div>

            <div className="p-6">
              
              {/* Payment Context */}
              {modalConfig.type === 'payment' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg text-sm mb-4">
                    Recording payment for <span className="font-bold">{modalConfig.student?.name}</span> ({modalConfig.student?.college_id}). 
                    Current total due: <span className="font-bold text-rose-600">{modalConfig.student?.monthly_due + modalConfig.student?.sem_due + modalConfig.student?.exam_due} Tk</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received (Tk)</label>
                    <input type="number" className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Apply to Category</label>
                    <select className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500">
                      <option>Monthly Dues</option>
                      <option>Semester Dues</option>
                      <option>RU Exam Dues</option>
                    </select>
                  </div>
                  <button onClick={closeModal} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors">
                    Confirm & Save Receipt
                  </button>
                </div>
              )}

              {/* Rates Context */}
              {modalConfig.type === 'rates' && (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600 mb-4">Set baseline structural fees for <span className="font-bold">{modalConfig.student?.name}</span>.</div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Agreed Monthly Fee</label>
                    <input type="number" defaultValue={modalConfig.student?.monthly_due || 0} className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Agreed Semester Fee</label>
                    <input type="number" defaultValue={modalConfig.student?.sem_due || 0} className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  {/* Added RU Exam Fee to Rates Modal */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Agreed RU Exam Fee</label>
                    <input type="number" defaultValue={modalConfig.student?.exam_due || 0} className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <button onClick={closeModal} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors">
                    Save Rates
                  </button>
                </div>
              )}

              {/* Mass Billing Context */}
              {modalConfig.type === 'mass_bill' && (
                <div className="space-y-4">
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm mb-4">
                    <strong>Warning:</strong> You are about to apply a {modalConfig.billType} charge to <strong>ALL</strong> students currently in the filtered view.
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Charge Amount per Student (Tk)</label>
                    <input type="number" placeholder="e.g. 2500" className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-rose-500" />
                  </div>
                  <button onClick={closeModal} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors shadow-lg shadow-rose-200">
                    Execute Mass Billing
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}