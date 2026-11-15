'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Copy, FileQuestion, Lock, Pencil, Play, Plus, Share2, Square, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { Badge, Button, Card, EmptyState, PageHeader, cx, table } from '../../components/ui';
import { useConfirm, useToast } from '../../components/Providers';
import { supabase } from '../../../utils/supabase';
import type { McqExam } from '../../../utils/mcq';
import ExamEditor from './_components/ExamEditor';
import ExamResults from './_components/ExamResults';

type Row = McqExam & { joined: number; submitted: number };

const STATUS = {
  draft: { tone: 'slate', label: 'Draft' },
  open: { tone: 'emerald', label: 'Open' },
  closed: { tone: 'rose', label: 'Closed' },
} as const;

// HOD only (proxy.ts + RLS): MCQ exams for a semester's students or anyone with the link + password.
export default function McqExamsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [exams, setExams] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [results, setResults] = useState<Row | null>(null);
  const [sharing, setSharing] = useState<Row | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    Promise.all([
      supabase.from('mcq_exams').select('*').order('created_at', { ascending: false }),
      supabase.from('mcq_attempts').select('exam_id, submitted_at'),
    ]).then(([e, a]) => {
      if (e.error) return toast.error(`Could not load exams: ${e.error.message}`);
      const attempts = (a.data ?? []) as { exam_id: string; submitted_at: string | null }[];
      setExams(((e.data ?? []) as McqExam[]).map((x) => ({
        ...x,
        joined: attempts.filter((t) => t.exam_id === x.id).length,
        submitted: attempts.filter((t) => t.exam_id === x.id && t.submitted_at).length,
      })));
    });
  }, [toast]);
  useEffect(load, [load]);

  const manage = async (exam: Row, action: 'open' | 'close') => {
    const ok = await confirm(action === 'open'
      ? { title: `Open "${exam.title}"?`, body: exam.semester ? `Semester ${exam.semester} students will see it in their portal, and anyone with the link + password can join.` : 'Anyone with the link + password can join.', confirmLabel: 'Open exam' }
      : { title: `Close "${exam.title}"?`, body: 'Nobody can join any more. Anyone still answering is graded on what they have saved so far.', confirmLabel: 'Close exam', tone: 'danger' });
    if (!ok) return;
    setBusy(exam.id);
    const res = await fetch('/api/mcq/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: exam.id, action }) });
    const body = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return toast.error(body.error ?? 'Could not change the exam.');
    toast.success(action === 'open' ? 'Exam is open. Share the link and password.' : `Exam closed${body.graded ? ` — ${body.graded} unfinished attempt${body.graded === 1 ? '' : 's'} graded` : ''}.`);
    if (action === 'open') setSharing({ ...exam, status: 'open' });
    load();
  };

  const remove = async (exam: Row) => {
    if (!(await confirm({ title: `Delete "${exam.title}"?`, body: exam.joined ? `Its ${exam.joined} result${exam.joined === 1 ? '' : 's'} are deleted too. This cannot be undone.` : 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const { error } = await supabase.from('mcq_exams').delete().eq('id', exam.id);
    if (error) return toast.error(`Could not delete: ${error.message}`);
    toast.success('Exam deleted.');
    load();
  };

  return (
    <div>
      <PageHeader
        title="MCQ Exams"
        description="Online multiple-choice exams with a timer. Only you (HOD) can see this page."
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>New exam</Button>}
      />

      <Card>
        {exams === null ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
        ) : exams.length === 0 ? (
          <EmptyState icon={FileQuestion} title="No MCQ exams yet" body="Create one, upload the question set as a PDF, check the answers, then open it for a semester." action={<Button icon={Plus} onClick={() => setEditing('new')}>New exam</Button>} />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Exam</th><th className={table.th}>For</th><th className={table.th}>Questions</th>
                  <th className={table.th}>Time</th><th className={table.th}>Status</th><th className={table.th}>Taken</th>
                  <th className={table.th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {exams.map((x) => (
                  <tr key={x.id} className={table.row}>
                    <td className={cx(table.td, 'font-medium text-slate-900')}>{x.title}</td>
                    <td className={cx(table.td, 'whitespace-nowrap')}>{x.semester ? `Semester ${x.semester}` : <span className="text-slate-500">Link only</span>}</td>
                    <td className={cx(table.td, 'tabular-nums')}>{x.questions.length}</td>
                    <td className={cx(table.td, 'whitespace-nowrap')}>{x.duration_minutes} min</td>
                    <td className={table.td}><Badge tone={STATUS[x.status].tone} dot>{STATUS[x.status].label}</Badge></td>
                    <td className={cx(table.td, 'tabular-nums')}>{x.submitted}{x.joined > x.submitted && <span className="text-slate-500"> (+{x.joined - x.submitted} taking)</span>}</td>
                    <td className={cx(table.td, 'text-right')}>
                      <div className="flex justify-end gap-1">
                        {x.status !== 'open'
                          ? <Button size="xs" variant="success" icon={Play} loading={busy === x.id} onClick={() => manage(x, 'open')}>{x.status === 'closed' ? 'Reopen' : 'Open'}</Button>
                          : <Button size="xs" variant="danger" icon={Square} loading={busy === x.id} onClick={() => manage(x, 'close')}>Close</Button>}
                        {x.status !== 'draft' && <Button size="xs" variant="secondary" icon={Share2} onClick={() => setSharing(x)}>Share</Button>}
                        <Button size="xs" variant="secondary" icon={BarChart3} onClick={() => setResults(x)}>Results</Button>
                        <Button size="xs" variant="ghost" icon={x.joined ? Lock : Pencil} onClick={() => setEditing(x)} aria-label={`Edit ${x.title}`} />
                        <Button size="xs" variant="ghost" icon={Trash2} onClick={() => remove(x)} aria-label={`Delete ${x.title}`} className="hover:bg-rose-50 hover:text-rose-600" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ExamEditor
          exam={editing === 'new' ? null : editing}
          locked={editing !== 'new' && editing.joined > 0}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {results && <ExamResults exam={results} onClose={() => { setResults(null); load(); }} />}
      {sharing && <ShareExam exam={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

function ShareExam({ exam, onClose }: { exam: McqExam; onClose: () => void }) {
  const toast = useToast();
  const link = `${window.location.origin}/mcq/${exam.code}`;
  const message = `${exam.title}\nJoin: ${link}\nPassword: ${exam.password}\nTime: ${exam.duration_minutes} minutes`;
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error('Could not copy — select the text and copy it.'));

  return (
    <Modal title="Share the exam" description={exam.semester ? `Semester ${exam.semester} students also see it in their portal (no password needed).` : 'Only people with the link and password can join.'} onClose={onClose}>
      <div className="space-y-4">
        {[['Link', link], ['Password', exam.password]].map(([label, value]) => (
          <div key={label}>
            <p className="mb-1 text-sm font-medium text-slate-700">{label}</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm">{value}</code>
              <Button variant="secondary" icon={Copy} onClick={() => copy(value, label)} aria-label={`Copy ${label}`} />
            </div>
          </div>
        ))}
        <Button className="w-full" icon={Copy} onClick={() => copy(message, 'Message')}>Copy message for WhatsApp / Messenger</Button>
        {exam.status !== 'open' && <p className="text-xs text-amber-700">The exam is {exam.status} — nobody can join until you open it.</p>}
      </div>
    </Modal>
  );
}
