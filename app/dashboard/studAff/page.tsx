'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { classifyCohorts, matchesCohort, orderByCohort, type CohortFilter } from '../../../utils/cohort';
import { AlertTriangle, BadgeCheck, CalendarRange, GraduationCap, Landmark, Search, Wallet } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../../utils/eligibility';
import { SEMESTERS, totalDue, type Student } from '../../../utils/types';
import { Button, Card, CohortSelect, PageHeader, StatCard, inputClass, taka } from '../../components/ui';
import { useConfirm, useToast } from '../../components/Providers';
import LedgerTable from './_components/LedgerTable';
import PaymentModal from './_components/PaymentModal';
import DuesModal from './_components/DuesModal';
import HistoryModal from './_components/HistoryModal';

type BillType = 'Monthly' | 'Semester' | 'RU Exam';
const BILL_CATEGORY: Record<BillType, string> = { Monthly: 'monthly', Semester: 'semester', 'RU Exam': 'ru_exam' };
const ATTENDANCE_FINE = 1000;

export default function StudentAffairsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>('all');
  const [modal, setModal] = useState<{ type: 'payment' | 'dues' | 'history'; student: Student } | null>(null);

  const fetchStudents = useCallback(() =>
    supabase
      .from('master_students')
      .select('*')
      .order('ru_id', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Could not load students: ${error.message}`);
        else setStudents(data as Student[]);
        setLoading(false);
      }), [toast]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const filteredStudents = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return orderByCohort(students.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(query) || s.college_id.includes(searchQuery) || (s.ru_id ?? '').includes(searchQuery);
      const matchesSem = semesterFilter === 'All' || s.semester.toString() === semesterFilter;
      return matchesSearch && matchesSem && matchesCohort(cohortFilter, cohorts.get(s.id));
    }), cohorts);
  }, [students, searchQuery, semesterFilter, cohortFilter, cohorts]);

  const metrics = useMemo(() => {
    const sum = (pick: (s: Student) => number) => filteredStudents.reduce((total, s) => total + pick(s), 0);
    const cleared = filteredStudents.filter((s) => totalDue(s) === 0).length;
    return {
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

  const scope = semesterFilter === 'All' ? 'all semesters' : `semester ${semesterFilter}`;

  // --- MASS ACTIONS (each is one all-or-nothing database call) ---
  const handleMassBill = async (billType: BillType) => {
    if (filteredStudents.length === 0) return toast.info('No students match the current filter.');
    const multiplier = billType === 'Monthly' ? 6 : 1;
    const ok = await confirm({
      title: `Bill ${billType} fee to ${filteredStudents.length} students?`,
      body: `Students shown (${scope}${searchQuery ? `, matching “${searchQuery}”` : ''}) are charged ${multiplier > 1 ? `${multiplier} × their monthly rate` : 'their contract rate'}.\nAnyone already billed ${billType} for their current semester is skipped automatically.`,
      confirmLabel: `Bill ${filteredStudents.length} students`,
    });
    if (!ok) return;

    setBusy(billType);
    const { data, error } = await supabase.rpc('bill_students', {
      p_student_ids: filteredStudents.map((s) => s.id),
      p_category: BILL_CATEGORY[billType],
    });
    setBusy(null);

    if (error) toast.error(`Billing failed — nobody was billed.\n${error.message}`);
    else if (data.billed === 0 && data.already_billed === 0) toast.error(`Nobody was billed: all ${data.skipped_zero_rate} students have a ${billType} rate of 0. Set their rates with “Edit dues” first.`);
    else toast.success(`${billType} billed to ${data.billed} student${data.billed === 1 ? '' : 's'}.\n${data.already_billed} already billed this semester · ${data.skipped_zero_rate} with no rate.`);
    fetchStudents();
  };

  const handleAttendanceFines = async () => {
    const targets = filteredStudents.filter((s) => (s.attendance_percentage || 0) < MIN_ATTENDANCE_PERCENT);
    if (targets.length === 0) return toast.info(`No students in this view are below ${MIN_ATTENDANCE_PERCENT}% attendance.`);
    const ok = await confirm({
      title: `Fine ${targets.length} students ${taka(ATTENDANCE_FINE)}?`,
      body: `These students are below ${MIN_ATTENDANCE_PERCENT}% attendance. Anyone already fined this semester is skipped automatically.`,
      confirmLabel: 'Apply fines',
      tone: 'danger',
    });
    if (!ok) return;

    setBusy('fine');
    const { data, error } = await supabase.rpc('apply_attendance_fines', {
      p_student_ids: targets.map((s) => s.id),
      p_amount: ATTENDANCE_FINE,
      p_threshold: MIN_ATTENDANCE_PERCENT,
    });
    setBusy(null);

    if (error) toast.error(`Fines not applied: ${error.message}`);
    else toast.success(`Fined ${data.fined} student${data.fined === 1 ? '' : 's'}. ${data.already_fined} already fined this semester.`);
    fetchStudents();
  };

  return (
    <>
      <PageHeader title="Finance & Student Affairs" description="Bill fees, take payments and keep every student's account straight." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total uncollected" value={taka(metrics.grandTotalDue)} hint={`Across ${scope}`} icon={Wallet} tone="rose" />
        <StatCard label="Monthly dues" value={taka(metrics.monthly)} icon={CalendarRange} tone="indigo" />
        <StatCard label="Semester & exam dues" value={taka(metrics.semExam)} icon={GraduationCap} tone="violet" />
        <StatCard
          label="Students cleared"
          value={loading ? '—' : `${metrics.cleared}/${filteredStudents.length}`}
          hint={`${taka(metrics.finesCollected)} in fines collected`}
          icon={BadgeCheck}
          tone="emerald"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="search" placeholder="Search name, College ID or RU ID" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`${inputClass} pl-9`} />
            </div>
            <CohortSelect value={cohortFilter} onChange={setCohortFilter} className="sm:w-44" />
            <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className={`${inputClass} sm:w-44`} aria-label="Semester">
              <option value="All">All semesters</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 hidden text-xs font-semibold uppercase tracking-wide text-slate-400 2xl:inline">Bill everyone shown</span>
            <Button size="sm" variant="secondary" icon={Landmark} loading={busy === 'Monthly'} onClick={() => handleMassBill('Monthly')}>Monthly ×6</Button>
            <Button size="sm" variant="secondary" icon={Landmark} loading={busy === 'Semester'} onClick={() => handleMassBill('Semester')}>Semester</Button>
            <Button size="sm" variant="secondary" icon={Landmark} loading={busy === 'RU Exam'} onClick={() => handleMassBill('RU Exam')}>RU Exam</Button>
            <Button size="sm" variant="danger" icon={AlertTriangle} loading={busy === 'fine'} onClick={handleAttendanceFines}>Fine &lt;{MIN_ATTENDANCE_PERCENT}% attendance</Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading accounts…</div>
        ) : (
          <LedgerTable
            students={filteredStudents}
            cohorts={cohorts}
            showSemester={semesterFilter === 'All'}
            onPayment={(student) => setModal({ type: 'payment', student })}
            onHistory={(student) => setModal({ type: 'history', student })}
            onDues={(student) => setModal({ type: 'dues', student })}
          />
        )}
      </Card>

      {modal?.type === 'payment' && <PaymentModal student={modal.student} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal?.type === 'dues' && <DuesModal student={modal.student} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal?.type === 'history' && <HistoryModal student={modal.student} onClose={() => setModal(null)} />}
    </>
  );
}
