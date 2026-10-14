'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, GraduationCap, History, PauseCircle, Undo2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Field, ReaddBadge, cx, inputClass, table } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { bestAttempts } from '../../../../utils/grades';
import { classifyCohorts, orderByCohort } from '../../../../utils/cohort';
import { semesterTitle } from '../../../../utils/rollsheet';
import { SEMESTERS, type CourseResult, type SemesterResult, type Student } from '../../../../utils/types';

type Action = 'promote' | 'hold' | 'graduate';
type Row = { student: Student; suggested: Action; why: string; action: Action; reason: string; ru: SemesterResult | null; fails: string[] };
type Move = { batch_id: string; student_id: string; action: Action; from_semester: number; moved_by_name: string | null; moved_at: string; undone_at: string | null };

// RU prints the year-end result ("Pass", "Fail", "Not Promoted", …). Anything but a pass holds back.
const FAILED = /fail|not\s*prom|re-?ad|withh?eld|incomplete|absent/i;

const ACTION_LABEL = (action: Action, semester: number) =>
  action === 'promote' ? `Promote to ${semester + 1}` : action === 'graduate' ? 'Graduate' : `Hold in ${semester}`;

// Academic → Promote students: after the exam, move a whole semester up in one step. Every
// student gets a suggestion (RU's result decides who is held back); any of them can be changed.
export default function PromoteModal({ students, onClose, onSaved }: { students: Student[]; onClose: () => void; onSaved: (message: string) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const counts = useMemo(() => {
    const map = new Map<number, number>();
    students.forEach((s) => map.set(s.semester, (map.get(s.semester) ?? 0) + 1));
    return map;
  }, [students]);
  const [semester, setSemester] = useState(() => SEMESTERS.find((n) => counts.get(n)) ?? 1);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [busy, setBusy] = useState(false);

  const cohorts = useMemo(() => classifyCohorts(students), [students]);
  const inSemester = useMemo(() => orderByCohort(students.filter((s) => s.semester === semester), cohorts), [students, semester, cohorts]);

  // Suggestions from the published results of this semester.
  useEffect(() => {
    const ids = inSemester.map((s) => s.id);
    if (ids.length === 0) return;
    Promise.all([
      supabase.from('semester_results').select('*').eq('semester', semester).in('student_id', ids).order('published_at', { ascending: false }),
      supabase.from('course_results').select('*').eq('semester', semester).in('student_id', ids),
    ]).then(([official, grades]) => {
      const latest = new Map<string, SemesterResult>();
      ((official.data ?? []) as SemesterResult[]).forEach((r) => { if (r.student_id && !latest.has(r.student_id)) latest.set(r.student_id, r); });
      const gradesOf = new Map<string, CourseResult[]>();
      ((grades.data ?? []) as CourseResult[]).forEach((g) => gradesOf.set(g.student_id, [...(gradesOf.get(g.student_id) ?? []), g]));
      setRows(inSemester.map((student) => {
        const ru = latest.get(student.id) ?? null;
        const fails = [...bestAttempts(gradesOf.get(student.id) ?? []).values()].filter((r) => r.grade === 'F').map((r) => r.course_code);
        const failed = !!ru?.result_status && FAILED.test(ru.result_status);
        const suggested: Action = failed ? 'hold' : semester === 8 ? 'graduate' : 'promote';
        const why = failed ? `RU result: ${ru!.result_status}` : ru ? (ru.result_status ? `RU result: ${ru.result_status}` : 'Result published') : 'No result published yet';
        return { student, suggested, why, action: suggested, reason: failed ? `RU result: ${ru!.result_status}` : '', ru, fails };
      }));
    });
  }, [inSemester, semester]);

  const loadMoves = useCallback(() =>
    supabase.from('student_moves').select('batch_id, student_id, action, from_semester, moved_by_name, moved_at, undone_at')
      .order('moved_at', { ascending: false }).limit(300)
      .then(({ data }) => setMoves((data ?? []) as Move[])), []);
  useEffect(() => { loadMoves(); }, [loadMoves]);

  const batches = useMemo(() => {
    const map = new Map<string, Move[]>();
    moves.forEach((m) => map.set(m.batch_id, [...(map.get(m.batch_id) ?? []), m]));
    return [...map.values()].slice(0, 5);
  }, [moves]);

  const setRow = (id: string, patch: Partial<Row>) => setRows((rows ?? []).map((r) => (r.student.id === id ? { ...r, ...patch } : r)));
  const setAll = (action: Action) => setRows((rows ?? []).map((r) => ({ ...r, action })));

  const list = rows ?? [];
  const tally = { promote: list.filter((r) => r.action === 'promote').length, hold: list.filter((r) => r.action === 'hold').length, graduate: list.filter((r) => r.action === 'graduate').length };
  const changed = list.filter((r) => r.action !== r.suggested);
  const missingReason = list.filter((r) => r.action === 'hold' && !r.reason.trim());

  const apply = async () => {
    if (missingReason.length) return toast.error(`Give a reason for each student held back (${missingReason.length} missing).`);
    const ok = await confirm({
      title: `Move semester ${semester} students?`,
      body: [
        tally.promote && `${tally.promote} promoted to semester ${semester + 1}`,
        tally.hold && `${tally.hold} held back in semester ${semester}`,
        tally.graduate && `${tally.graduate} graduated`,
      ].filter(Boolean).join(' · ') + '.\nAttendance, the eligibility override and exam registration start fresh for everyone moved. You can undo this afterwards.',
      confirmLabel: 'Apply',
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('promote_students', {
      p_from_semester: semester,
      p_moves: list.map((r) => ({ student_id: r.student.id, action: r.action, reason: r.reason.trim() || (r.action !== r.suggested ? null : r.why) })),
    });
    setBusy(false);
    if (error) return toast.error(`Nothing was changed: ${error.message}`);
    const parts = [data.promote && `${data.promote} promoted`, data.hold && `${data.hold} held back`, data.graduate && `${data.graduate} graduated`, data.skipped && `${data.skipped} skipped (already moved)`].filter(Boolean);
    onSaved(`Semester ${semester}: ${parts.join(', ') || 'no changes'}.`);
  };

  const undo = async (batch: Move[]) => {
    const ok = await confirm({
      title: 'Undo this promotion?',
      body: `${batch.length} students go back to semester ${batch[0].from_semester} with their old attendance, override and registration. Anyone moved again since is left as they are.`,
      confirmLabel: 'Undo',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('undo_student_moves', { p_batch: batch[0].batch_id });
    setBusy(false);
    if (error) return toast.error(`Could not undo: ${error.message}`);
    onSaved(`Undone: ${data.restored} students restored${data.skipped ? `, ${data.skipped} left as they are (moved again since)` : ''}.`);
  };

  const small = cx(inputClass, 'h-8 px-2 text-xs');

  return (
    <Modal title="Promote students" description="After the exam: move a semester up in one step. The suggestions come from RU's results; change any student by hand." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Field label="Semester" className="sm:w-72">
            <select value={semester} onChange={(e) => { setRows(null); setSemester(Number(e.target.value)); }} className={inputClass}>
              {SEMESTERS.map((n) => <option key={n} value={n} disabled={!counts.get(n)}>{n} · {semesterTitle(n)} ({counts.get(n) ?? 0})</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            {semester < 8 && <Button size="sm" variant="secondary" icon={ArrowUpCircle} onClick={() => setAll('promote')}>Promote all</Button>}
            {semester === 8 && <Button size="sm" variant="secondary" icon={GraduationCap} onClick={() => setAll('graduate')}>Graduate all</Button>}
            <Button size="sm" variant="ghost" onClick={() => setRows(list.map((r) => ({ ...r, action: r.suggested })))}>Back to suggestions</Button>
          </div>
        </div>

        {inSemester.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No students in semester {semester}.</p>
        ) : !rows ? (
          <p className="py-8 text-center text-sm text-slate-500">Checking results…</p>
        ) : (
          <>
            <div className={`${table.wrap} max-h-[48vh] overflow-y-auto rounded-xl ring-1 ring-slate-200`}>
              <table className={table.table}>
                <thead className={`${table.head} sticky top-0 z-10`}>
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Semester {semester} result</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {list.map((r) => (
                    <tr key={r.student.id} className={cx('align-top', r.action === 'hold' && 'bg-amber-50/60')}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{r.student.name || '—'}{cohorts.get(r.student.id) === 'readd' && <ReaddBadge />}</p>
                        <p className="font-mono text-xs text-slate-500">{r.student.ru_id || r.student.college_id}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <p className={cx(r.suggested === 'hold' ? 'font-semibold text-rose-700' : 'text-slate-600')}>{r.why}</p>
                        {r.ru?.gpa != null && <p className="text-slate-500">GPA {Number(r.ru.gpa).toFixed(2)}{r.ru.ygpa != null ? ` · YGPA ${Number(r.ru.ygpa).toFixed(2)}` : ''}</p>}
                        {r.fails.length > 0 && <p className="text-amber-700">F in {r.fails.join(', ')}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <select value={r.action} onChange={(e) => setRow(r.student.id, { action: e.target.value as Action })} className={cx(small, 'w-36')} aria-label={`Action for ${r.student.name}`}>
                          {semester < 8 && <option value="promote">{ACTION_LABEL('promote', semester)}</option>}
                          {semester === 8 && <option value="graduate">Graduate</option>}
                          <option value="hold">{ACTION_LABEL('hold', semester)}</option>
                        </select>
                        {r.action !== r.suggested && <p className="mt-1 text-[11px] font-semibold text-violet-700">Changed by hand</p>}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.reason}
                          onChange={(e) => setRow(r.student.id, { reason: e.target.value })}
                          placeholder={r.action === 'hold' ? 'Why held back (required)' : 'Optional note'}
                          className={cx(small, 'w-48', r.action === 'hold' && !r.reason.trim() && 'bg-amber-50 ring-amber-300')}
                          aria-label={`Reason for ${r.student.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {missingReason.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Give a reason for each student held back — it is kept in their history.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                {tally.promote > 0 && <Badge tone="emerald">{tally.promote} promoted to {semester + 1}</Badge>}
                {tally.graduate > 0 && <Badge tone="violet">{tally.graduate} graduate</Badge>}
                {tally.hold > 0 && <Badge tone="amber">{tally.hold} held back</Badge>}
                {changed.length > 0 && <Badge tone="slate">{changed.length} changed by hand</Badge>}
              </div>
              <Button icon={semester === 8 ? GraduationCap : ArrowUpCircle} loading={busy} onClick={apply}>Apply to {list.length} students</Button>
            </div>
          </>
        )}

        {batches.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900"><History className="size-4" aria-hidden /> Recent promotions</p>
            <ul className="space-y-1.5">
              {batches.map((batch) => {
                const done = batch.every((m) => m.undone_at);
                const n = (a: Action) => batch.filter((m) => m.action === a).length;
                return (
                  <li key={batch[0].batch_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200">
                    <span className={cx('text-slate-700', done && 'text-slate-400 line-through')}>
                      Semester {batch[0].from_semester} · {[n('promote') && `${n('promote')} promoted`, n('hold') && `${n('hold')} held back`, n('graduate') && `${n('graduate')} graduated`].filter(Boolean).join(', ')}
                      <span className="text-slate-400"> · {new Date(batch[0].moved_at).toLocaleDateString()} · {batch[0].moved_by_name ?? '—'}</span>
                    </span>
                    {done ? <Badge tone="slate">Undone</Badge> : <Button size="xs" variant="ghost" icon={Undo2} loading={busy} onClick={() => undo(batch)}>Undo</Button>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {semester === 8 && <p className="flex items-center gap-1.5 text-xs text-slate-500"><PauseCircle className="size-3.5" aria-hidden /> Graduates leave Academic and Exams, and stay in Finance until their dues are paid.</p>}
      </div>
    </Modal>
  );
}
