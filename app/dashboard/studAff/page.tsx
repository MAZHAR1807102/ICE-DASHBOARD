'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../../utils/eligibility';
import { SEMESTERS, totalDue, type Student } from '../../../utils/types';
import PortalHeader from '../../components/PortalHeader';
import LedgerTable from './_components/LedgerTable';
import PaymentModal from './_components/PaymentModal';
import DuesModal from './_components/DuesModal';
import HistoryModal from './_components/HistoryModal';

type BillType = 'Monthly' | 'Semester' | 'RU Exam';
const BILL_CATEGORY: Record<BillType, string> = { Monthly: 'monthly', Semester: 'semester', 'RU Exam': 'ru_exam' };
const ATTENDANCE_FINE = 1000;

export default function StudentAffairsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [modal, setModal] = useState<{ type: 'payment' | 'dues' | 'history'; student: Student } | null>(null);

  const fetchStudents = useCallback(() =>
    supabase
      .from('master_students')
      .select('*')
      .order('ru_id', { ascending: false })
      .then(({ data, error }) => {
        if (error) alert(`Could not load students: ${error.message}`);
        else setStudents(data as Student[]);
        setLoading(false);
      }), []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return students.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(query) || s.college_id.includes(searchQuery) || (s.ru_id ?? '').includes(searchQuery);
      const matchesSem = semesterFilter === 'All' || s.semester.toString() === semesterFilter;
      return matchesSearch && matchesSem;
    });
  }, [students, searchQuery, semesterFilter]);

  const metrics = useMemo(() => {
    const sum = (pick: (s: Student) => number) => filteredStudents.reduce((total, s) => total + pick(s), 0);
    const cleared = filteredStudents.filter((s) => totalDue(s) === 0).length;
    return {
      totalStudents: filteredStudents.length,
      cleared,
      pending: filteredStudents.length - cleared,
      monthly: sum((s) => s.monthly_due || 0),
      semExam: sum((s) => (s.semester_due || 0) + (s.exam_due || 0)),
      finesCollected: sum((s) => s.total_fines_paid || 0),
      grandTotalDue: sum(totalDue),
    };
  }, [filteredStudents]);

  const afterSave = () => {
    setModal(null);
    fetchStudents();
  };

  // --- MASS ACTIONS (each is one all-or-nothing database call) ---
  const handleMassBill = async (billType: BillType) => {
    if (filteredStudents.length === 0) return alert('No students found in current filter.');
    const multiplier = billType === 'Monthly' ? 6 : 1;
    if (!window.confirm(`Are you sure you want to bill ${billType} to all ${filteredStudents.length} filtered students?\n\nThis multiplies their base rate by ${multiplier} and adds it to their running total.\nStudents already billed ${billType} for their current semester are skipped automatically.`)) return;

    setLoading(true);
    const { data, error } = await supabase.rpc('bill_students', {
      p_student_ids: filteredStudents.map((s) => s.id),
      p_category: BILL_CATEGORY[billType],
    });

    if (error) {
      alert(`Billing failed — no one was billed.\n${error.message}`);
    } else if (data.billed === 0 && data.already_billed === 0) {
      alert(`⚠️ NO STUDENTS BILLED.\n\nAll ${data.skipped_zero_rate} students were skipped because their base rate is 0.\nYou MUST use the 'Edit Dues' button to set their contract rates first!`);
    } else {
      alert(`${billType} billing applied to ${data.billed} student(s).\n${data.already_billed} already billed this semester (skipped).\n${data.skipped_zero_rate} skipped because their base rate is 0.`);
    }
    fetchStudents();
  };

  const handleAttendanceFines = async () => {
    const targets = filteredStudents.filter((s) => (s.attendance_percentage || 0) < MIN_ATTENDANCE_PERCENT);
    if (targets.length === 0) return alert(`No students in the current view have attendance below ${MIN_ATTENDANCE_PERCENT}%.`);
    if (!window.confirm(`Apply ${ATTENDANCE_FINE} Tk fine to ${targets.length} students with low attendance?\n\nStudents already fined this semester are skipped automatically.`)) return;

    setLoading(true);
    const { data, error } = await supabase.rpc('apply_attendance_fines', {
      p_student_ids: targets.map((s) => s.id),
      p_amount: ATTENDANCE_FINE,
      p_threshold: MIN_ATTENDANCE_PERCENT,
    });

    if (error) alert(`Error applying fines: ${error.message}`);
    else alert(`Fined ${data.fined} student(s).\n${data.already_fined} already fined this semester (skipped).`);
    fetchStudents();
  };

  const kpis = [
    { label: 'Monthly Dues', value: metrics.monthly },
    { label: 'Sem & Exam Dues', value: metrics.semExam },
  ];

  return (
    <div className="min-h-screen bg-[#f4f7f9] p-6 lg:p-10 font-sans text-slate-800">
      <PortalHeader title="Student Affairs & Finance" accent="emerald" />

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Filtered Students</p>
          <p className="text-3xl font-black text-slate-800">{loading ? '...' : metrics.totalStudents}</p>
          <div className="flex space-x-3 mt-2 text-xs font-medium">
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{metrics.cleared} Cleared</span>
            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{metrics.pending} Pending</span>
          </div>
        </div>
        {kpis.map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-800">৳{value.toLocaleString()}</p>
          </div>
        ))}
        <div className="rounded-xl shadow-sm border border-emerald-200 p-5 bg-gradient-to-br from-white to-emerald-50/50">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Lifetime Fines Collected</p>
          <p className="text-2xl font-bold text-emerald-600">৳{metrics.finesCollected.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-rose-200 p-5">
          <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">Grand Total Uncollected</p>
          <p className="text-3xl font-black text-rose-600">৳{metrics.grandTotalDue.toLocaleString()}</p>
        </div>
      </div>

      {/* LEDGER */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-600 mr-2">1-Click Mass Billing:</span>
            <button onClick={() => handleMassBill('Monthly')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ Monthly (x6)</button>
            <button onClick={() => handleMassBill('Semester')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ Semester (x1)</button>
            <button onClick={() => handleMassBill('RU Exam')} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded shadow-sm transition-colors">+ RU Exam (x1)</button>
            <button onClick={handleAttendanceFines} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow-sm transition-colors ml-4">
              ⚠️ Auto-Fine (&lt;{MIN_ATTENDANCE_PERCENT}% Att.)
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
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500 font-medium">Fetching real-time ledger...</div>
          ) : (
            <LedgerTable
              students={filteredStudents}
              onPayment={(student) => setModal({ type: 'payment', student })}
              onHistory={(student) => setModal({ type: 'history', student })}
              onDues={(student) => setModal({ type: 'dues', student })}
            />
          )}
        </div>
      </div>

      {modal?.type === 'payment' && <PaymentModal student={modal.student} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal?.type === 'dues' && <DuesModal student={modal.student} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal?.type === 'history' && <HistoryModal student={modal.student} onClose={() => setModal(null)} />}
    </div>
  );
}
