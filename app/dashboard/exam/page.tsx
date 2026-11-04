'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { classifyCohorts, groupHeadings, matchesCohort, orderByCohort, type CohortFilter } from '../../../utils/cohort';
import { Ban, Calculator, CalendarCheck, CheckCircle2, Clock, FileBadge, FileStack, FlaskConical, FolderOpen, GraduationCap, History, IdCard, NotebookTabs, ScanSearch, ScrollText, Search, Sheet, Users } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { MIN_ATTENDANCE_PERCENT } from '../../../utils/eligibility';
import { DEGREE_CREDITS, type Student } from '../../../utils/types';
import { Badge, Button, Card, CohortSelect, EmptyState, GroupHeading, PageHeader, ReaddBadge, SemesterChips, StatCard, inputClass, table } from '../../components/ui';
import MenuButton from '../../components/MenuButton';
import { useStoredState } from '../../../utils/useStoredState';
import { useConfirm, useToast } from '../../components/Providers';
import PublishResultsModal from './_components/PublishResultsModal';
import StartingCgpaModal from './_components/StartingCgpaModal';
import PublishedResultsModal from './_components/PublishedResultsModal';
import StudentResultsModal from './_components/StudentResultsModal';
import RollSheetModal from './_components/RollSheetModal';
import LabSheetModal from './_components/LabSheetModal';
import CaSheetModal from './_components/CaSheetModal';
import CustomCaSheetModal from './_components/CustomCaSheetModal';
import AdmitCardModal from './_components/AdmitCardModal';
import { GradeCalculatorModal } from '../../components/GradeCalculator';
import TopSheetModal from './_components/TopSheetModal';
import ExamAttendanceSheet from './_components/ExamAttendanceSheet';

type ExamStudent = Pick<Student, 'id' | 'college_id' | 'ru_id' | 'name' | 'semester' | 'exam_reg_status' | 'backlogs' | 'internal_marks_status' | 'attendance_percentage' | 'cgpa' | 'credits_earned'>;

const STATUS_TONE = { Done: 'emerald', Blocked: 'rose', Pending: 'amber' } as const;

export default function ExaminationDashboard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [selectedSemester, setSelectedSemester] = useStoredState<string>('exam.semester', 'All');
  const [search, setSearch] = useState('');
  const [cohortFilter, setCohortFilter] = useStoredState<CohortFilter>('exam.cohort', 'all', ['all', 'regular', 'readd']);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isStartingOpen, setIsStartingOpen] = useState(false);
  const [isPublishedOpen, setIsPublishedOpen] = useState(false);
  const [resultsFor, setResultsFor] = useState<ExamStudent | null>(null);
  const [isRollSheetOpen, setIsRollSheetOpen] = useState(false);
  const [isLabSheetOpen, setIsLabSheetOpen] = useState(false);
  const [isCaSheetOpen, setIsCaSheetOpen] = useState(false);
  const [isCustomCaOpen, setIsCustomCaOpen] = useState(false);
  const [isAdmitOpen, setIsAdmitOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isTopSheetOpen, setIsTopSheetOpen] = useState(false);
  const [isGradeOpen, setIsGradeOpen] = useState(false);

  const fetchExamData = useCallback(() =>
    supabase
      .from('master_students')
      .select('id, college_id, ru_id, name, semester, exam_reg_status, backlogs, internal_marks_status, attendance_percentage, cgpa, credits_earned')
      .eq('status', 'active')
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

  const closeAttendance = useCallback(() => setIsAttendanceOpen(false), []);
  const query = search.toLowerCase();
  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const displayedStudents = orderByCohort(students.filter((s) =>
    (selectedSemester === 'All' || s.semester.toString() === selectedSemester) &&
    matchesCohort(cohortFilter, cohorts.get(s.id)) &&
    (!query || s.name.toLowerCase().includes(query) || s.college_id.includes(search) || (s.ru_id ?? '').includes(search)),
  ), cohorts);
  const headings = groupHeadings(displayedStudents, cohorts, selectedSemester === 'All');
  const semesterCounts = students.reduce<Record<number, number>>((m, s) => ({ ...m, [s.semester]: (m[s.semester] ?? 0) + 1 }), {});
  const countBy = (status: string) => displayedStudents.filter((s) => (s.exam_reg_status || 'Pending') === status).length;

  return (
    <>
      <PageHeader
        title="Examination & Assessment"
        description="Registration status, eligibility and semester results."
        actions={<>
          <Button variant="secondary" icon={ScanSearch} loading={isChecking} onClick={handleCheckEligibility}>Auto-check eligibility</Button>
          <MenuButton label="Results" icon={FileStack} items={[
            { label: 'Published results', hint: 'RU sheets already imported; edit or remove', icon: FileStack, onClick: () => setIsPublishedOpen(true) },
            { label: 'Earlier results', hint: 'Starting CGPA for semesters never uploaded', icon: History, onClick: () => setIsStartingOpen(true) },
          ]} />
          <MenuButton label="Documents" icon={FolderOpen} items={[
            { label: 'Roll sheet', hint: 'Examinees of a semester, with subjects', icon: ScrollText, onClick: () => setIsRollSheetOpen(true) },
            { label: 'Admit card distribution', hint: 'Signature list for collecting admit cards', icon: IdCard, onClick: () => setIsAdmitOpen(true) },
            { label: 'Attendance sheet', hint: 'Class attendance sheet per course', icon: CalendarCheck, onClick: () => setIsAttendanceOpen(true) },
            { label: 'Lab mark sheet', hint: 'Experiment · CT · AT per lab course', icon: FlaskConical, onClick: () => setIsLabSheetOpen(true) },
            { label: 'CA mark sheet', hint: 'CTs, attendance and CA total per theory course', icon: Sheet, onClick: () => setIsCaSheetOpen(true) },
            { label: 'Custom CA sheet — courses or rolls not in the portal', indent: true, onClick: () => setIsCustomCaOpen(true) },
            { label: 'Top sheet', hint: 'Cover pages for the Lab / CA bundles sent to RU', icon: NotebookTabs, onClick: () => setIsTopSheetOpen(true) },
            { label: 'Grade calculator', hint: 'Marks → grade and grade point', icon: Calculator, onClick: () => setIsGradeOpen(true) },
          ]} />
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
            <CohortSelect value={cohortFilter} onChange={setCohortFilter} className="sm:w-44" />
          </div>
        </div>
        <SemesterChips value={selectedSemester} onChange={setSelectedSemester} counts={semesterCounts} className="border-b border-slate-100 px-4 py-3" />

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
                  <th className={`${table.th} text-right`}>Results · status</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {displayedStudents.map((student) => {
                  const attendance = student.attendance_percentage || 0;
                  const status = (student.exam_reg_status || 'Pending') as keyof typeof STATUS_TONE;
                  const heading = headings.get(student.id);
                  return (
                    <Fragment key={student.id}>
                    {heading && <GroupHeading colSpan={8} {...heading} />}
                    <tr className={table.row}>
                      <td className={table.td}>
                        <p className="font-medium text-slate-900">{student.name}{cohorts.get(student.id) === 'readd' && <ReaddBadge />}</p>
                        <p className="text-xs text-slate-500">{student.college_id} · RU {student.ru_id || '—'} · Sem {student.semester}</p>
                      </td>
                      <td className={`${table.td} text-center`}><Badge tone={attendance < MIN_ATTENDANCE_PERCENT ? 'rose' : 'emerald'}>{attendance}%</Badge></td>
                      <td className={`${table.td} text-center font-semibold tabular-nums text-slate-900`}>{Number(student.cgpa) > 0 ? Number(student.cgpa).toFixed(2) : '—'}</td>
                      <td className={`${table.td} text-center tabular-nums text-slate-600`}>{Number(student.credits_earned) > 0 ? `${Number(student.credits_earned)}/${DEGREE_CREDITS}` : '—'}</td>
                      <td className={`${table.td} text-center tabular-nums ${(student.backlogs || 0) > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{student.backlogs || 0}</td>
                      <td className={table.td}><Badge tone={student.internal_marks_status === 'Submitted' ? 'emerald' : 'slate'}>{student.internal_marks_status || 'Pending'}</Badge></td>
                      <td className={table.td}><Badge tone={STATUS_TONE[status] ?? 'amber'} dot>{status === 'Done' ? 'Verified' : status}</Badge></td>
                      <td className={`${table.td} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                        <Button size="xs" variant="secondary" icon={GraduationCap} onClick={() => setResultsFor(student)}>Results</Button>
                        <select
                          value={status}
                          disabled={updatingId === student.id}
                          onChange={(e) => updateExamStatus(student.id, e.target.value)}
                          className={`${inputClass} h-8 w-32 py-0 text-xs`}
                          aria-label={`Registration status for ${student.name}`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Done">Verified</option>
                          <option value="Blocked">Blocked</option>
                        </select>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isRollSheetOpen && <RollSheetModal onClose={() => setIsRollSheetOpen(false)} />}
      {isLabSheetOpen && <LabSheetModal onClose={() => setIsLabSheetOpen(false)} />}
      {isCaSheetOpen && <CaSheetModal onClose={() => setIsCaSheetOpen(false)} onCustom={() => { setIsCaSheetOpen(false); setIsCustomCaOpen(true); }} />}
      {isCustomCaOpen && <CustomCaSheetModal onClose={() => setIsCustomCaOpen(false)} />}
      {isAdmitOpen && <AdmitCardModal onClose={() => setIsAdmitOpen(false)} />}
      {isAttendanceOpen && <ExamAttendanceSheet initialSemester={selectedSemester === 'All' ? 1 : Number(selectedSemester)} onClose={closeAttendance} />}
      {isTopSheetOpen && <TopSheetModal onClose={() => setIsTopSheetOpen(false)} />}
      {isGradeOpen && <GradeCalculatorModal onClose={() => setIsGradeOpen(false)} />}
      {resultsFor && <StudentResultsModal student={resultsFor} onClose={() => setResultsFor(null)} onChanged={fetchExamData} />}
      {isPublishedOpen && <PublishedResultsModal onClose={() => setIsPublishedOpen(false)} onChanged={fetchExamData} />}
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
