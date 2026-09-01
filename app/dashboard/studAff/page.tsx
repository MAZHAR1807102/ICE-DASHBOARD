'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../../utils/supabase';
import { useRouter } from 'next/navigation';

export default function StudentAffairsPage() {
  const router = useRouter();

  // --- AUTH & PASSWORD STATE ---
  const [teacherName, setTeacherName] = useState('Loading Faculty...');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // --- STATE MANAGEMENT ---
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  
  // Payment Processing States
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentCategory, setPaymentCategory] = useState('Monthly Dues');
  
  const [editRates, setEditRates] = useState({ monthly: 0, sem: 0, exam: 0, fine: 0 });

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'payment' | 'rates' | null;
    student: any | null;
  }>({ isOpen: false, type: null, student: null });

  // --- INITIALIZATION ---
  useEffect(() => {
    const session = localStorage.getItem('faculty_user');
    if (session) {
      const user = JSON.parse(session);
      setTeacherName(user.name);
    } else {
      router.replace('/login');
    }

    fetchStudents();
  }, [router]);

  async function fetchStudents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('master_students')
      .select('*')
      .order('ru_id', { ascending: false });

    if (!error && data) {
      const formattedData = data.map(s => ({
        id: s.id,
        college_id: s.college_id,
        ru_id: s.ru_id || 'N/A',
        name: s.name,
        semester: s.semester,
        attendance_percentage: s.attendance_percentage || 0,
        
        // Base Contract Rates (Set via Edit Dues)
        base_monthly: s.agreed_monthly_fee || 0,
        base_sem: s.agreed_semester_fee || 0,
        base_exam: s.agreed_ru_exam_fee || 0,
        
        // Running Balances (What they actually owe right now)
        monthly_due: s.monthly_due || 0,
        sem_due: s.semester_due || 0,
        exam_due: s.exam_due || 0,
        fine_due: s.attendance_fine || 0,
        fines_collected: s.total_fines_paid || 0 
      }));
      setStudents(formattedData);
    }
    setLoading(false);
  }

  // --- AUTHENTICATION ACTIONS ---
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

  // --- FINANCIAL ACTIONS ---
  const handleApplyAttendanceFines = async () => {
    const targetStudents = filteredStudents.filter(s => s.attendance_percentage < 60);
    
    if (targetStudents.length === 0) {
      return alert("No students in the current view have attendance below 60%.");
    }

    if (!window.confirm(`Apply 1000 Tk fine to ${targetStudents.length} students with low attendance?`)) {
      return;
    }

    setLoading(true);
    for (const student of targetStudents) {
      if (student.fine_due === 0) {
        await supabase
          .from('master_students')
          .update({ attendance_fine: 1000 })
          .eq('id', student.id);
      }
    }
    
    alert("Attendance fines applied successfully.");
    fetchStudents();
  };

  const handleReceivePayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      return alert("Please enter a valid payment amount.");
    }

    const s = modalConfig.student;
    const amount = Number(paymentAmount);
    let updates: any = {};

    if (paymentCategory === 'Attendance Fine') {
      const newDue = Math.max(0, s.fine_due - amount);
      const actuallyPaid = s.fine_due - newDue; 
      updates = {
        attendance_fine: newDue,
        total_fines_paid: s.fines_collected + actuallyPaid
      };
    } else if (paymentCategory === 'Monthly Dues') {
      updates = { monthly_due: Math.max(0, s.monthly_due - amount) };
    } else if (paymentCategory === 'Semester Dues') {
      updates = { semester_due: Math.max(0, s.sem_due - amount) };
    } else if (paymentCategory === 'RU Exam Dues') {
      updates = { exam_due: Math.max(0, s.exam_due - amount) };
    }

    const { error } = await supabase
      .from('master_students')
      .update(updates)
      .eq('id', s.id);

    if (!error) {
      alert(`Successfully processed ৳${amount} for ${paymentCategory}.`);
      closeModal();
      fetchStudents();
    } else {
      alert(`Error processing payment: ${error.message}`);
    }
  };

  const handleUpdateRates = async () => {
    const s = modalConfig.student;
    const { error } = await supabase
      .from('master_students')
      .update({
        agreed_monthly_fee: editRates.monthly,
        agreed_semester_fee: editRates.sem,
        agreed_ru_exam_fee: editRates.exam,
        attendance_fine: editRates.fine
      })
      .eq('id', s.id);

    if (!error) {
      alert(`Contract Dues successfully set for ${s.name}.`);
      closeModal();
      fetchStudents();
    } else {
      alert(`Error updating dues: ${error.message}`);
    }
  };

  // NEW: 1-Click Mass Billing Execution
  const handleExecuteMassBill = async (billType: 'Monthly' | 'Semester' | 'RU Exam') => {
    if (filteredStudents.length === 0) return alert("No students found in current filter.");

    const multiplier = billType === 'Monthly' ? 6 : 1;

    if (!window.confirm(`Are you sure you want to bill ${billType} to all ${filteredStudents.length} filtered students?\n\n(This will add ${multiplier}x their contract rate to their running dues)`)) {
      return;
    }

    setLoading(true);

    await Promise.all(filteredStudents.map(async (student) => {
      let fieldToUpdate = '';
      let amountToAdd = 0;
      let currentAmount = 0;

      if (billType === 'Monthly') {
        fieldToUpdate = 'monthly_due';
        amountToAdd = student.base_monthly * 6; // Adds 6 months!
        currentAmount = student.monthly_due;
      } else if (billType === 'Semester') {
        fieldToUpdate = 'semester_due';
        amountToAdd = student.base_sem * 1; // Adds 1 semester!
        currentAmount = student.sem_due;
      } else if (billType === 'RU Exam') {
        fieldToUpdate = 'exam_due';
        amountToAdd = student.base_exam * 1; // Adds 1 RU Exam!
        currentAmount = student.exam_due;
      }

      // Only hit the database if there is actually money to add
      if (amountToAdd > 0) {
        return supabase
          .from('master_students')
          .update({ [fieldToUpdate]: currentAmount + amountToAdd })
          .eq('id', student.id);
      }
    }));

    alert(`Mass billing successfully applied to the batch!`);
    fetchStudents();
  };

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
    let totalFinesDue = 0;
    let totalFinesCollected = 0;
    let clearedCount = 0;
    
    filteredStudents.forEach(s => {
      totalMonthly += s.monthly_due;
      totalSemExam += (s.sem_due + s.exam_due);
      totalFinesDue += s.fine_due;
      totalFinesCollected += s.fines_collected;
      if (s.monthly_due === 0 && s.sem_due === 0 && s.exam_due === 0 && s.fine_due === 0) clearedCount++;
    });

    return {
      totalStudents: filteredStudents.length,
      cleared: clearedCount,
      pending: filteredStudents.length - clearedCount,
      monthly: totalMonthly,
      semExam: totalSemExam,
      finesCollected: totalFinesCollected,
      grandTotalDue: totalMonthly + totalSemExam + totalFinesDue
    };
  }, [filteredStudents]);

  // --- MODAL HANDLERS ---
  const openModal = (type: 'payment' | 'rates', student: any = null) => {
    setPaymentAmount(''); 
    setPaymentCategory('Monthly Dues'); 

    // Pre-fill the base rates if opening the Edit Dues modal
    if (type === 'rates' && student) {
      setEditRates({
        monthly: student.base_monthly,
        sem: student.base_sem,
        exam: student.base_exam,
        fine: student.fine_due // Fine is a running balance, so we keep it here for manual override
      });
    }

    setModalConfig({ isOpen: true, type, student });
  };

  const closeModal = () => setModalConfig({ isOpen: false, type: null, student: null });

  return (
    <div className="min-h-screen bg-[#f4f7f9] p-6 lg:p-10 font-sans text-slate-800">
      
      {/* HEADER */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-5">
          <div className="flex -space-x-3">
            <div className="w-14 h-14 rounded-full bg-white shadow-sm border-2 border-slate-200 flex items-center justify-center z-10 overflow-hidden">
              <span className="text-xs font-bold text-slate-400 text-center leading-tight">ICE<br/>Logo</span>
            </div>
            <div className="w-14 h-14 rounded-full bg-emerald-50 shadow-sm border-2 border-emerald-200 flex items-center justify-center z-0 overflow-hidden">
              <span className="text-[10px] font-bold text-emerald-500 text-center leading-tight">Dept<br/>Logo</span>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Student Affairs & Finance</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              {teacherName} | Department of CSE
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsPasswordModalOpen(true)} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-bold shadow-sm transition-colors">
            Change Password
          </button>
          <button onClick={handleLogout} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm transition-colors">
            Logout
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Filtered Students</p>
          <p className="text-3xl font-black text-slate-800">{loading ? '...' : metrics.totalStudents}</p>
          <div className="flex space-x-3 mt-2 text-xs font-medium">
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{metrics.cleared} Cleared</span>
            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{metrics.pending} Pending</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Monthly Dues</p>
          <p className="text-2xl font-bold text-slate-800">৳{metrics.monthly.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Sem & Exam Dues</p>
          <p className="text-2xl font-bold text-slate-800">৳{metrics.semExam.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-5 bg-gradient-to-br from-white to-emerald-50/50">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Lifetime Fines Collected</p>
          <p className="text-2xl font-bold text-emerald-600">৳{metrics.finesCollected.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-rose-200 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -z-10"></div>
          <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">Grand Total Uncollected</p>
          <p className="text-3xl font-black text-rose-600">৳{metrics.grandTotalDue.toLocaleString()}</p>
        </div>
      </div>

      {/* Main Ledger */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-600 mr-2">Mass Billing:</span>
            <button onClick={() => handleExecuteMassBill('Monthly')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ Monthly (x6)</button>
            <button onClick={() => handleExecuteMassBill('Semester')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ Semester (x1)</button>
            <button onClick={() => handleExecuteMassBill('RU Exam')} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ RU Exam (x1)</button>
            
            <button onClick={handleApplyAttendanceFines} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow-sm transition-colors ml-4 flex items-center">
              ⚠️ Auto-Fine (&lt;60% Att.)
            </button>
          </div>

          <div className="flex items-center space-x-3 w-full xl:w-auto">
            <input 
              type="text" 
              placeholder="Search Name or ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full xl:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <select 
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="All">All Semesters</option>
              {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Semester {n}</option>)}
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
                  <th className="px-6 py-4 font-bold text-slate-500 text-center">Att. %</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Monthly</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Sem.</th>
                  <th className="px-6 py-4 font-bold text-slate-500">Exam</th>
                  <th className="px-6 py-4 font-bold text-rose-500 bg-rose-50/30">Fine Due</th>
                  <th className="px-6 py-4 font-black text-slate-800 bg-slate-50">Total Due</th>
                  <th className="px-6 py-4 font-bold text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => {
                  const totalDue = s.monthly_due + s.sem_due + s.exam_due + s.fine_due;
                  const isCleared = totalDue === 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{s.college_id}</td>
                      <td className="px-6 py-4 text-slate-500">{s.ru_id}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">{s.name}</td>
                      
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${s.attendance_percentage < 60 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {s.attendance_percentage}%
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className={`font-bold ${s.monthly_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{s.monthly_due > 0 ? s.monthly_due : '-'}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Rate: {s.base_monthly}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`font-bold ${s.sem_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{s.sem_due > 0 ? s.sem_due : '-'}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Rate: {s.base_sem}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`font-bold ${s.exam_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{s.exam_due > 0 ? s.exam_due : '-'}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Rate: {s.base_exam}</div>
                      </td>
                      <td className={`px-6 py-4 font-bold bg-rose-50/30 ${s.fine_due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {s.fine_due > 0 ? s.fine_due : '-'}
                      </td>
                      
                      <td className="px-6 py-4 font-black bg-slate-50 text-slate-800">
                        {isCleared ? <span className="text-emerald-600 flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>Cleared</span> : <span>৳{totalDue}</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center space-x-2">
                          <button onClick={() => openModal('payment', s)} className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded text-xs font-bold transition-colors">Payment</button>
                          <button onClick={() => openModal('rates', s)} className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 rounded text-xs font-bold transition-colors">Edit Dues</button>
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

      {/* MODAL SYSTEM */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">
                {modalConfig.type === 'payment' && 'Receive Payment'}
                {modalConfig.type === 'rates' && 'Set Contract Dues'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700 font-bold text-xl">×</button>
            </div>

            <div className="p-6">
              
              {/* PAYMENT CONTEXT */}
              {modalConfig.type === 'payment' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg text-sm mb-4 border border-blue-100">
                    Recording payment for <span className="font-bold text-blue-900">{modalConfig.student?.name}</span>. <br/>
                    Current total due: <span className="font-bold text-rose-600">৳{modalConfig.student?.monthly_due + modalConfig.student?.sem_due + modalConfig.student?.exam_due + modalConfig.student?.fine_due}</span>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Amount Received (Tk)</label>
                    <input 
                      type="number" 
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value ? Number(e.target.value) : '')}
                      className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" 
                      placeholder="0" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Apply to Category</label>
                    <select 
                      value={paymentCategory}
                      onChange={(e) => setPaymentCategory(e.target.value)}
                      className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="Monthly Dues">Monthly Dues (Running Due: ৳{modalConfig.student?.monthly_due})</option>
                      <option value="Semester Dues">Semester Dues (Running Due: ৳{modalConfig.student?.sem_due})</option>
                      <option value="RU Exam Dues">RU Exam Dues (Running Due: ৳{modalConfig.student?.exam_due})</option>
                      <option value="Attendance Fine">Attendance Fine (Running Due: ৳{modalConfig.student?.fine_due})</option>
                    </select>
                  </div>
                  <button onClick={handleReceivePayment} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors">
                    Confirm & Save Receipt
                  </button>
                </div>
              )}

              {/* RATES/DUES CONTEXT */}
              {modalConfig.type === 'rates' && (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600 mb-4">Set permanent contract rates for <span className="font-bold">{modalConfig.student?.name}</span>. Mass billing will use these rates.</div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Monthly Contract Rate (1 Month)</label><input type="number" value={editRates.monthly} onChange={(e) => setEditRates({...editRates, monthly: Number(e.target.value)})} className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Semester Contract Rate</label><input type="number" value={editRates.sem} onChange={(e) => setEditRates({...editRates, sem: Number(e.target.value)})} className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">RU Exam Contract Rate</label><input type="number" value={editRates.exam} onChange={(e) => setEditRates({...editRates, exam: Number(e.target.value)})} className="w-full border-slate-300 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  <div><label className="block text-sm font-bold text-rose-600 mb-1">Running Fine Balance (Manual Override)</label><input type="number" value={editRates.fine} onChange={(e) => setEditRates({...editRates, fine: Number(e.target.value)})} className="w-full border-rose-300 bg-rose-50 border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-rose-500" /></div>
                  
                  <button onClick={handleUpdateRates} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg mt-4 transition-colors">
                    Save Contract Dues
                  </button>
                </div>
              )}
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
