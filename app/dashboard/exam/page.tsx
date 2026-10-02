'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock, FileBadge, GraduationCap, History, ScanSearch, Search, Users } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../../utils/eligibility';
import { DEGREE_CREDITS, SEMESTERS, type Student } from '../../../utils/types';
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, inputClass, table } from '../../components/ui';
import { useConfirm, useToast } from '../../components/Providers';
import PublishResultsModal from './_components/PublishResultsModal';
import StartingCgpaModal from './_components/StartingCgpaModal';

type ExamStudent = Pick<Student, 'id' | 'college_id' | 'ru_id' | 'name' | 'semester' | 'exam_reg_status' | 'backlogs' | 'internal_marks_status' | 'attendance_percentage' | 'cgpa' | 'credits_earned'>;

const STATUS_TONE = { Done: 'emerald', Blocked: 'rose', Pending: 'amber' } as const;

export default function ExaminationDashboard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isStartingOpen, setIsStartingOpen] = useState(false);

  const fetchExamData = useCallback(() =>
    supabase
      .from('master_students')
      .select('id, college_id, ru_id, name, semester, exam_reg_status, backlogs, internal_marks_status, attendance_percentage, cgpa, credits_earned')
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
    if (error) return toast.error('Status not updated.');
    fetchExamData();
  };

  const handleCheckEligibility = async () => {
    const ok = await confirm({
      title: 'Run the eligibility check?',
      body: `Students in ${selectedSemester === 'All' ? 'all semesters' : `semester ${selectedSemester}`} with attendance below ${MIN_ATTENDANCE_PERCENT}% or unpaid dues are marked Blocked, unless the academic office has approved an override.`,
      confirmLabel: 'Run check',
    });
    if (!ok) return;
    setIsChecking(true);
    try {
      const response = await fetch('/api/exams/check-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester: selectedSemester }),
      });
      const result = await response.json();
      if (response.ok) { toast.success(result.message); fetchExamData(); }
      else toast.error(result.error || result.message || 'Check failed.');
    } catch {
      toast.error('Server error.');
    } finally {
      setIsChecking(false);
    }
  };

  const query = search.toLowerCase();
  const displayedStudents = students.filter((s) =>
    (selectedSemester === 'All' || s.semester.toString() === selectedSemester) &&
    (!query || s.name.toLowerCase().includes(query) || s.college_id.includes(search) || (s.ru_id ?? '').includes(search)),
  );
  const countBy = (status: string) => displayedStudents.filter((s) => (s.exam_reg_status || 'Pending') === status).length;

  return (
    <>
      <PageHeader
        title="Examination & Assessment"
        description="Registration status, eligibility and semester results."
        actions={<>
          <Button variant="secondary" icon={ScanSearch} loading={isChecking} onClick={handleCheckEligibility}>Auto-check eligibility</Button>
          <Button variant="secondary" icon={History} onClick={() => setIsStartingOpen(true)}>Earlier results</Button>
          <Button icon={GraduationCap} onClick={() => setIsPublishOpen(true)}>Publish Results</Button>
        </>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Candidates" value={displayedStudents.length} icon={Users} tone="indigo" />
        <StatCard label="Registration verified" value={countBy('Done')} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Pending" value={countBy('Pending')} icon={Clock} tone="amber" />
        <StatCard label="Blocked" value={countBy('Blocked')} hint="By the system or the HOD" icon={Ban} tone="rose" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">Exam Registration Ledger</p>
            <p className="text-sm text-slate-500">Change a student&apos;s status with the selector on the right.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID" className={`${inputClass} pl-9`} />
            </div>
            <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className={`${inputClass} sm:w-40`} aria-label="Semester">
              <option value="All">All semesters</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
        </div>

        {displayedStudents.length === 0 ? (
          <EmptyState icon={FileBadge} title="No students found" />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Student</th>
                  <th className={`${table.th} text-center`}>Attendance</th>
                  <th className={`${table.th} text-center`}>CGPA</th>
                  <th className={`${table.th} text-center`}>Credits</th>
                  <th className={`${table.th} text-center`}>Backlogs</th>
                  <th className={table.th}>Internal marks</th>
                  <th className={table.th}>Registration</th>
                  <th className={`${table.th} text-right`}>Set status</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {displayedStudents.map((student) => {
                  const attendance = student.attendance_percentage || 0;
                  const status = (student.exam_reg_status || 'Pending') as keyof typeof STATUS_TONE;
                  return (
                    <tr key={student.id} className={table.row}>
                      <td className={table.td}>
                        <p className="font-medium text-slate-900">{student.name}</p>
                        <p className="text-xs text-slate-500">{student.college_id} · RU {student.ru_id || '—'} · Sem {student.semester}</p>
                      </td>
                      <td className={`${table.td} text-center`}><Badge tone={attendance < MIN_ATTENDANCE_PERCENT ? 'rose' : 'emerald'}>{attendance}%</Badge></td>
                      <td className={`${table.td} text-center font-semibold tabular-nums text-slate-900`}>{Number(student.cgpa) > 0 ? Number(student.cgpa).toFixed(2) : '—'}</td>
                      <td className={`${table.td} text-center tabular-nums text-slate-600`}>{Number(student.credits_earned) > 0 ? `${Number(student.credits_earned)}/${DEGREE_CREDITS}` : '—'}</td>
                      <td className={`${table.td} text-center tabular-nums ${(student.backlogs || 0) > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{student.backlogs || 0}</td>
                      <td className={table.td}><Badge tone={student.internal_marks_status === 'Submitted' ? 'emerald' : 'slate'}>{student.internal_marks_status || 'Pending'}</Badge></td>
                      <td className={table.td}><Badge tone={STATUS_TONE[status] ?? 'amber'} dot>{status === 'Done' ? 'Verified' : status}</Badge></td>
                      <td className={`${table.td} text-right`}>
                        <select
                          value={status}
                          disabled={updatingId === student.id}
                          onChange={(e) => updateExamStatus(student.id, e.target.value)}
                          className={`${inputClass} ml-auto h-8 w-36 py-0 text-xs`}
                          aria-label={`Registration status for ${student.name}`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Done">Verified</option>
                          <option value="Blocked">Blocked</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isStartingOpen && <StartingCgpaModal students={students} onClose={() => setIsStartingOpen(false)} onSaved={fetchExamData} />}

      {isPublishOpen && (
        <PublishResultsModal
          students={students}
          onClose={() => setIsPublishOpen(false)}
          onPublished={(msg) => { setIsPublishOpen(false); toast.success(msg); fetchExamData(); }}
        />
      )}
    </>
  );
}
