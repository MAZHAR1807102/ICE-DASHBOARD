'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { History, Pencil, Plus, Trash2, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, Tabs, cx, inputClass, table } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { GRADES } from '../../../../utils/grades';
import { DEGREE_CREDITS, SEMESTERS, type CourseResult, type SemesterResult, type Student } from '../../../../utils/types';
import ReasonDialog from './ReasonDialog';

type Who = Pick<Student, 'id' | 'name' | 'college_id' | 'ru_id' | 'semester'>;
type Official = SemesterResult & { id: string };
type Change = { id: string; semester: number | null; table_name: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null; changed_by_name: string | null; changed_at: string };
type CourseDraft = { id: string | null; semester: number; exam_key: string; course_code: string; course_name: string; credit: string; grade: string };
type OfficialDraft = { id: string | null; semester: number; exam_key: string; exam_title: string; earned_credits: string; gpa: string; year_earned_credits: string; ygpa: string; result_status: string; merit_position: string };
type Pending = { title: string; summary: string; danger?: boolean; confirmLabel?: string; run: (reason: string) => Promise<{ error: { message: string } | null }> };

// Short, readable label for an exam key: "Regular 2024", "Improvement 2025", "Manual entry".
export function examLabel(key: string) {
  if (!key) return 'Template entry';
  if (key === 'manual') return 'Manual entry';
  const kind = /improve/.test(key) ? 'Improvement' : /retake|re-?ad|backlog/.test(key) ? 'Retake' : 'Regular';
  const year = key.match(/20\d\d(?!.*20\d\d)/)?.[0];
  return year ? `${kind} ${year}` : kind;
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

// Everything published for one student, editable by the exam office — each change needs a reason.
export default function StudentResultsModal({ student, onClose, onChanged }: { student: Who; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<'results' | 'history'>('results');
  const [courses, setCourses] = useState<CourseResult[] | null>(null);
  const [official, setOfficial] = useState<Official[]>([]);
  const [standing, setStanding] = useState<{ cgpa: number | null; credits_earned: number | null; backlogs: number | null } | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [courseDraft, setCourseDraft] = useState<CourseDraft | null>(null);
  const [officialDraft, setOfficialDraft] = useState<OfficialDraft | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const load = useCallback(() =>
    Promise.all([
      supabase.from('course_results').select('*').eq('student_id', student.id).order('semester').order('course_code'),
      supabase.from('semester_results').select('*').eq('student_id', student.id).order('semester'),
      supabase.from('master_students').select('cgpa, credits_earned, backlogs').eq('id', student.id).single(),
      supabase.from('result_changes').select('*').eq('student_id', student.id).order('changed_at', { ascending: false }).limit(200),
    ]).then(([c, o, m, h]) => {
      setCourses((c.data ?? []) as CourseResult[]);
      setOfficial((o.data ?? []) as Official[]);
      setStanding(m.data as typeof standing);
      setHistory((h.data ?? []) as Change[]);
    }), [student.id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (reason: string) => {
    if (!pending) return;
    const { error } = await pending.run(reason);
    if (error) return toast.error(`Not saved: ${error.message}`);
    toast.success('Saved. CGPA recalculated.');
    setPending(null);
    setCourseDraft(null);
    setOfficialDraft(null);
    load();
    onChanged();
  };

  // ---------- course results ----------
  const startCourse = (r?: CourseResult, semester?: number) =>
    setCourseDraft(r
      ? { id: r.id, semester: r.semester, exam_key: r.exam_key, course_code: r.course_code, course_name: r.course_name ?? '', credit: String(Number(r.credit)), grade: r.grade }
      : { id: null, semester: semester ?? student.semester, exam_key: 'manual', course_code: '', course_name: '', credit: '3', grade: 'A' });

  const askSaveCourse = () => {
    const d = courseDraft!;
    const code = d.course_code.toUpperCase().replace(/\s+/g, '');
    if (!code || !(Number(d.credit) > 0)) return toast.error('Course code and a credit above 0 are required.');
    const before = d.id ? courses?.find((c) => c.id === d.id) : undefined;
    const changes = before
      ? [
          before.course_code !== code && `code ${before.course_code} → ${code}`,
          Number(before.credit) !== Number(d.credit) && `credit ${Number(before.credit)} → ${d.credit}`,
          before.grade !== d.grade && `grade ${before.grade} → ${d.grade}`,
          before.semester !== d.semester && `semester ${before.semester} → ${d.semester}`,
        ].filter(Boolean).join(', ')
      : `add ${code} (${d.credit} cr) grade ${d.grade} to semester ${d.semester}`;
    if (before && !changes && (before.course_name ?? '') === d.course_name) return setCourseDraft(null);
    setPending({
      title: d.id ? `Change ${before?.course_code}` : 'Add a course result',
      summary: `${student.name}: ${changes || 'course name'}`,
      run: async (reason) => supabase.rpc('save_course_result', {
        p_id: d.id, p_student_id: student.id, p_semester: d.semester, p_exam_key: d.exam_key, p_course_code: code,
        p_course_name: d.course_name, p_credit: Number(d.credit), p_grade: d.grade, p_reason: reason,
      }),
    });
  };

  const askDeleteCourse = (r: CourseResult) => setPending({
    title: `Delete ${r.course_code} (${r.grade})?`,
    summary: `${student.name} · semester ${r.semester} · ${examLabel(r.exam_key)}. The CGPA is recalculated without it.`,
    danger: true,
    confirmLabel: 'Delete result',
    run: async (reason) => supabase.rpc('delete_course_result', { p_id: r.id, p_reason: reason }),
  });

  // ---------- official semester figures ----------
  const startOfficial = (o?: Official, semester?: number) => setOfficialDraft(o
    ? {
        id: o.id, semester: o.semester, exam_key: o.exam_key ?? '', exam_title: o.exam_title ?? '',
        earned_credits: o.earned_credits?.toString() ?? '', gpa: o.gpa?.toString() ?? '', year_earned_credits: o.year_earned_credits?.toString() ?? '',
        ygpa: o.ygpa?.toString() ?? '', result_status: o.result_status ?? '', merit_position: o.merit_position?.toString() ?? '',
      }
    : { id: null, semester: semester ?? student.semester, exam_key: 'manual', exam_title: '', earned_credits: '', gpa: '', year_earned_credits: '', ygpa: '', result_status: 'Pass', merit_position: '' });

  const askSaveOfficial = () => {
    const d = officialDraft!;
    if (d.gpa && !(Number(d.gpa) >= 0 && Number(d.gpa) <= 4)) return toast.error('GPA must be between 0 and 4.');
    setPending({
      title: d.id ? `Change semester ${d.semester} official figures` : `Add semester ${d.semester} official figures`,
      summary: `${student.name}: GPA ${d.gpa || '—'}, Year GPA ${d.ygpa || '—'}, ${d.result_status || 'no status'}${d.merit_position ? `, merit ${d.merit_position}` : ''}`,
      run: async (reason) => supabase.rpc('save_semester_result', {
        p_id: d.id, p_student_id: student.id, p_semester: d.semester, p_exam_key: d.exam_key, p_exam_title: d.exam_title || null,
        p_earned_credits: num(d.earned_credits), p_gpa: num(d.gpa), p_year_earned_credits: num(d.year_earned_credits), p_ygpa: num(d.ygpa),
        p_result_status: d.result_status, p_merit_position: num(d.merit_position), p_reason: reason,
      }),
    });
  };

  const askDeleteOfficial = (o: Official) => setPending({
    title: `Delete semester ${o.semester} official figures?`,
    summary: `${student.name} · ${examLabel(o.exam_key ?? '')}. Course grades are not affected.`,
    danger: true,
    confirmLabel: 'Delete figures',
    run: async (reason) => supabase.rpc('delete_semester_result', { p_id: o.id, p_reason: reason }),
  });

  const semesters = [...new Set([...(courses ?? []).map((c) => c.semester), ...official.map((o) => o.semester)])].sort((a, b) => b - a);
  const small = cx(inputClass, 'h-8 px-2 text-xs');

  const courseEditor = (d: CourseDraft) => (
    <tr className="bg-indigo-50/40">
      <td className="px-3 py-2"><input value={d.course_code} onChange={(e) => setCourseDraft({ ...d, course_code: e.target.value.toUpperCase() })} className={cx(small, 'w-28 font-mono')} aria-label="Course code" autoFocus /></td>
      <td className="px-3 py-2"><input value={d.course_name} onChange={(e) => setCourseDraft({ ...d, course_name: e.target.value })} className={cx(small, 'w-44')} aria-label="Course name" placeholder="Course name (optional)" /></td>
      <td className="px-3 py-2"><input type="number" step="0.25" min="0" value={d.credit} onChange={(e) => setCourseDraft({ ...d, credit: e.target.value })} className={cx(small, 'w-16 text-center')} aria-label="Credit" /></td>
      <td className="px-3 py-2">
        <select value={d.grade} onChange={(e) => setCourseDraft({ ...d, grade: e.target.value })} className={cx(small, 'w-20')} aria-label="Grade">
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select value={d.semester} onChange={(e) => setCourseDraft({ ...d, semester: Number(e.target.value) })} className={cx(small, 'w-24')} aria-label="Semester">
          {SEMESTERS.map((n) => <option key={n} value={n}>Sem {n}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button size="xs" onClick={askSaveCourse}>Save</Button>
        <Button size="xs" variant="ghost" icon={X} onClick={() => setCourseDraft(null)} aria-label="Cancel" />
      </td>
    </tr>
  );

  const officialEditor = (d: OfficialDraft) => (
    <div className="space-y-2 rounded-lg bg-indigo-50/40 p-3 ring-1 ring-indigo-100">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {([['gpa', 'GPA'], ['earned_credits', 'EC'], ['ygpa', 'Year GPA'], ['year_earned_credits', 'YEC'], ['merit_position', 'Merit']] as const).map(([k, label]) => (
          <label key={k} className="text-[11px] text-slate-500">{label}
            <input type="number" step="any" value={d[k]} onChange={(e) => setOfficialDraft({ ...d, [k]: e.target.value })} className={small} />
          </label>
        ))}
        <label className="text-[11px] text-slate-500">Result
          <select value={d.result_status} onChange={(e) => setOfficialDraft({ ...d, result_status: e.target.value })} className={small}>
            {['Pass', 'Cond', 'Fail', ''].map((r) => <option key={r} value={r}>{r || '—'}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-1">
        <Button size="xs" variant="ghost" onClick={() => setOfficialDraft(null)}>Cancel</Button>
        <Button size="xs" onClick={askSaveOfficial}>Save figures</Button>
      </div>
    </div>
  );

  const describe = (c: Change) => {
    const row = (c.after ?? c.before ?? {}) as Record<string, unknown>;
    if (c.table_name === 'semester_results') {
      if (c.action === 'update') return `Official figures: GPA ${c.before?.gpa ?? '—'} → ${c.after?.gpa ?? '—'}, ${c.before?.result_status ?? '—'} → ${c.after?.result_status ?? '—'}`;
      return `${c.action === 'insert' ? 'Added' : 'Deleted'} official figures (GPA ${row.gpa ?? '—'})`;
    }
    if (c.action === 'update') {
      const parts = (['course_code', 'grade', 'credit', 'semester'] as const)
        .filter((k) => String(c.before?.[k]) !== String(c.after?.[k]))
        .map((k) => `${k.replace('course_code', 'code')} ${c.before?.[k]} → ${c.after?.[k]}`);
      return `${c.before?.course_code}: ${parts.join(', ') || 'details updated'}`;
    }
    return `${c.action === 'insert' ? 'Added' : 'Deleted'} ${row.course_code} (${row.grade}, ${row.credit} cr)`;
  };

  return (
    <Modal title={`Results — ${student.name || student.college_id}`} description={`College ID ${student.college_id} · RU ${student.ru_id || '—'} · now in semester ${student.semester}`} size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'CGPA', value: standing?.cgpa ? Number(standing.cgpa).toFixed(3) : '—' },
            { label: 'Credits', value: `${Number(standing?.credits_earned ?? 0)} / ${DEGREE_CREDITS}` },
            { label: 'Backlogs', value: String(standing?.backlogs ?? 0) },
          ].map((t) => (
            <div key={t.label} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <p className="text-[11px] text-slate-500">{t.label}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{t.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'results', label: 'Results' }, { id: 'history', label: 'Change history', icon: History, count: history.length }]} />
          {tab === 'results' && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => startCourse()}>Add course result</Button>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => startOfficial()}>Add official figures</Button>
            </div>
          )}
        </div>

        {tab === 'results' && (courses === null ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            {courseDraft && courseDraft.id === null && (
              <div className={`${table.wrap} rounded-xl ring-1 ring-indigo-200`}><table className={table.table}><tbody>{courseEditor(courseDraft)}</tbody></table></div>
            )}
            {officialDraft && officialDraft.id === null && (
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Semester
                  <select value={officialDraft.semester} onChange={(e) => setOfficialDraft({ ...officialDraft, semester: Number(e.target.value) })} className={cx(small, 'ml-2 inline-block w-24')}>
                    {SEMESTERS.map((n) => <option key={n} value={n}>Sem {n}</option>)}
                  </select>
                </label>
                {officialEditor(officialDraft)}
              </div>
            )}
            {semesters.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No results published for this student yet.</p>}
            {semesters.map((sem) => (
              <section key={sem} className="rounded-xl ring-1 ring-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <p className="font-semibold text-slate-900">Semester {sem}</p>
                  <Button size="xs" variant="ghost" icon={Plus} onClick={() => startCourse(undefined, sem)}>Add course</Button>
                </div>
                {official.filter((o) => o.semester === sem).map((o) => (
                  <div key={o.id} className="border-b border-slate-100 px-4 py-2.5">
                    {officialDraft?.id === o.id ? officialEditor(officialDraft) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="slate">{examLabel(o.exam_key ?? '')}</Badge>
                          <span className="text-slate-700">GPA <b>{o.gpa ?? '—'}</b> · EC {o.earned_credits ?? '—'} · Year GPA {o.ygpa ?? '—'} · {o.result_status ?? '—'}{o.merit_position ? ` · Merit ${o.merit_position}` : ''}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="xs" variant="ghost" icon={Pencil} onClick={() => startOfficial(o)} aria-label="Edit official figures" />
                          <Button size="xs" variant="ghost" icon={Trash2} onClick={() => askDeleteOfficial(o)} aria-label="Delete official figures" className="hover:bg-rose-50 hover:text-rose-600" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className={table.wrap}>
                  <table className={table.table}>
                    <thead className={table.head}>
                      <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Course</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Exam</th><th className="px-3 py-2" /></tr>
                    </thead>
                    <tbody className={table.body}>
                      {(courses ?? []).filter((c) => c.semester === sem).map((c) => courseDraft?.id === c.id ? <Fragment key={c.id}>{courseEditor(courseDraft)}</Fragment> : (
                        <tr key={c.id} className={table.row}>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">{c.course_code}</td>
                          <td className="px-3 py-2 text-slate-600">{c.course_name ?? '—'}</td>
                          <td className="px-3 py-2 tabular-nums">{Number(c.credit)}</td>
                          <td className="px-3 py-2"><Badge tone={c.grade === 'F' ? 'rose' : c.grade.startsWith('A') ? 'emerald' : 'slate'}>{c.grade}</Badge></td>
                          <td className="px-3 py-2 text-xs text-slate-500">{examLabel(c.exam_key)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button size="xs" variant="ghost" icon={Pencil} onClick={() => startCourse(c)} aria-label={`Edit ${c.course_code}`} />
                            <Button size="xs" variant="ghost" icon={Trash2} onClick={() => askDeleteCourse(c)} aria-label={`Delete ${c.course_code}`} className="hover:bg-rose-50 hover:text-rose-600" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ))}

        {tab === 'history' && (history.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No changes recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg px-3 py-2 ring-1 ring-slate-100">
                <p className="text-sm text-slate-800">{describe(h)}</p>
                <p className="text-xs text-slate-500">
                  {new Date(h.changed_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {h.semester ? ` · Sem ${h.semester}` : ''}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                  {h.reason && <> · <i>“{h.reason}”</i></>}
                </p>
              </li>
            ))}
          </ol>
        ))}
      </div>

      {pending && <ReasonDialog title={pending.title} summary={pending.summary} danger={pending.danger} confirmLabel={pending.confirmLabel} onCancel={() => setPending(null)} onConfirm={run} />}
    </Modal>
  );
}
