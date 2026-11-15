'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileDown, RotateCcw } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, cx, table } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { SUBMIT_GRACE_SECONDS, cleanAnswers, gradeAnswers, type McqAttempt, type McqExam } from '../../../../utils/mcq';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Everyone who joined an exam, best score first, with an Excel download and a reset (sit again).
export default function ExamResults({ exam, onClose }: { exam: McqExam; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [attempts, setAttempts] = useState<McqAttempt[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(() => {
    supabase.from('mcq_attempts').select('*').eq('exam_id', exam.id).then(({ data, error }) => {
      if (error) return toast.error(`Could not load results: ${error.message}`);
      setAttempts((data ?? []) as McqAttempt[]);
      setLoadedAt(Date.now());
    });
  }, [exam.id, toast]);
  useEffect(load, [load]);

  // Unsubmitted attempts whose time is up are graded on what was saved (the server does the same
  // the next time that person or the HOD's "Close" touches them).
  const rows = (attempts ?? []).map((a) => {
    const timeUp = !a.submitted_at && loadedAt > new Date(a.deadline).getTime() + SUBMIT_GRACE_SECONDS * 1000;
    const { score, total } = a.submitted_at ? { score: a.score ?? 0, total: a.total ?? exam.questions.length } : gradeAnswers(exam.questions, cleanAnswers(a.answers, exam.questions));
    const status = a.submitted_at ? (a.auto_submitted ? 'Auto-submitted' : 'Submitted') : timeUp ? 'Time up' : 'Taking now';
    return { ...a, score, total, status, pct: total ? Math.round((score / total) * 100) : 0 };
  }).sort((a, b) => b.score - a.score || a.roll.localeCompare(b.roll));

  const download = async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      [exam.title], [],
      ['SL', 'Roll', 'Name', 'Score', 'Out of', 'Percent', 'Status', 'Started'],
      ...rows.map((r, i) => [i + 1, r.roll, r.name, r.score, r.total, r.pct, r.status, when(r.started_at)]),
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Results');
    XLSX.writeFile(book, `${exam.title.replace(/[\\/:*?"<>|]/g, '')} - results.xlsx`);
  };

  const reset = async (a: McqAttempt) => {
    if (!(await confirm({ title: `Reset ${a.roll}?`, body: `${a.name}'s attempt and score are deleted so they can take the exam again.`, confirmLabel: 'Reset', tone: 'danger' }))) return;
    const res = await fetch('/api/mcq/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: exam.id, action: 'reset', attemptId: a.id }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error ?? 'Could not reset.');
    toast.success(`${a.roll} can take the exam again.`);
    load();
  };

  const avg = rows.length ? (rows.reduce((s, r) => s + r.pct, 0) / rows.length).toFixed(0) : '—';

  return (
    <Modal title={`Results — ${exam.title}`} description={`${rows.length} joined · average ${avg}% · ${exam.questions.length} questions`} size="xl" onClose={onClose}>
      {attempts === null ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nobody has joined this exam yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end"><Button size="sm" variant="secondary" icon={FileDown} onClick={download}>Download Excel</Button></div>
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr><th className={table.th}>#</th><th className={table.th}>Roll</th><th className={table.th}>Name</th><th className={table.th}>Score</th><th className={table.th}>Status</th><th className={table.th}><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className={table.body}>
                {rows.map((r, i) => (
                  <tr key={r.id} className={table.row}>
                    <td className={cx(table.td, 'text-slate-500')}>{i + 1}</td>
                    <td className={cx(table.td, 'font-mono')}>{r.roll}</td>
                    <td className={table.td}>{r.name}</td>
                    <td className={cx(table.td, 'whitespace-nowrap font-semibold tabular-nums')}>{r.score}/{r.total} <span className="font-normal text-slate-500">({r.pct}%)</span></td>
                    <td className={table.td}>
                      <Badge tone={r.status === 'Taking now' ? 'sky' : r.status === 'Time up' ? 'amber' : 'emerald'} dot>{r.status}</Badge>
                    </td>
                    <td className={cx(table.td, 'text-right')}>
                      <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => reset(r)} className="hover:bg-rose-50 hover:text-rose-600">Reset</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
