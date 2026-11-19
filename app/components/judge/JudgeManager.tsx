'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, BookOpen, Code2, Copy, Eye, Lock, Pencil, Play, Plus, Server, Share2, Square, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import ProblemEditor from './ProblemEditor';
import TestEditor from './TestEditor';
import TestResults from './TestResults';
import { Badge, Button, Card, EmptyState, Tabs, cx, table } from '../ui';
import { useConfirm, useToast } from '../Providers';
import { supabase } from '../../../utils/supabase';
import { useSessionUser } from '../../../utils/useSessionUser';
import { KINDS, LANGUAGES, allCases, type JudgeProblem, type JudgeTest } from '../../../utils/judge';

type TestRow = JudgeTest & { joined: number; blocked: number };
const STATUS = {
  draft: { tone: 'slate', label: 'Draft' },
  open: { tone: 'emerald', label: 'Open' },
  closed: { tone: 'rose', label: 'Closed' },
} as const;

// Coding tests and the shared problem bank. Used in the teacher portal (each teacher: their own
// tests) and on the HOD dashboard (all tests; only the HOD unblocks students).
export default function JudgeManager() {
  const toast = useToast();
  const confirm = useConfirm();
  const user = useSessionUser();
  const isHod = user?.role === 'hod';
  const [tab, setTab] = useState<'tests' | 'bank'>('tests');
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [bank, setBank] = useState<JudgeProblem[]>([]);
  const [judge, setJudge] = useState<{ configured: boolean; reachable: boolean } | null>(null);
  const [editingTest, setEditingTest] = useState<TestRow | 'new' | null>(null);
  const [editingProblem, setEditingProblem] = useState<JudgeProblem | 'new' | null>(null);
  const [results, setResults] = useState<TestRow | null>(null);
  const [sharing, setSharing] = useState<TestRow | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    Promise.all([
      supabase.from('judge_tests').select('*').order('created_at', { ascending: false }),
      supabase.from('judge_participants').select('test_id, blocked'),
      supabase.from('judge_problems').select('*').order('created_at', { ascending: false }),
    ]).then(([t, p, b]) => {
      if (t.error) return toast.error(`Could not load coding tests: ${t.error.message}`);
      const people = (p.data ?? []) as { test_id: string; blocked: boolean }[];
      setTests(((t.data ?? []) as JudgeTest[]).map((x) => ({
        ...x,
        joined: people.filter((q) => q.test_id === x.id).length,
        blocked: people.filter((q) => q.test_id === x.id && q.blocked).length,
      })));
      setBank((b.data ?? []) as JudgeProblem[]);
    });
  }, [toast]);
  useEffect(load, [load]);
  useEffect(() => {
    fetch('/api/judge/status').then((r) => (r.ok ? r.json() : null)).then(setJudge).catch(() => {});
  }, []);

  const mine = (p: { created_by: string | null }) => isHod || p.created_by === user?.id;
  const usedIn = (id: string) => (tests ?? []).filter((t) => t.problems.some((p) => p.id === id));

  const manage = async (test: TestRow, action: 'open' | 'close') => {
    const ok = await confirm(action === 'open'
      ? { title: `Open "${test.title}"?`, body: test.semester ? `Semester ${test.semester} students will see it in their portal, and anyone with the link + password can join.` : 'Anyone with the link + password can join.', confirmLabel: 'Open test' }
      : { title: `Close "${test.title}"?`, body: 'Nobody can join or submit any more. Submissions already sent are still judged.', confirmLabel: 'Close test', tone: 'danger' });
    if (!ok) return;
    setBusy(test.id);
    const res = await fetch('/api/judge/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: test.id, action }) });
    const body = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return toast.error(body.error ?? 'Could not change the test.');
    toast.success(action === 'open' ? 'Test is open. Share the link and password.' : 'Test closed.');
    if (action === 'open') setSharing({ ...test, status: 'open' });
    load();
  };

  const removeTest = async (test: TestRow) => {
    if (!(await confirm({ title: `Delete "${test.title}"?`, body: test.joined ? `Its ${test.joined} participant${test.joined === 1 ? '' : 's'}, their submissions and marks are deleted too. This cannot be undone.` : 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const { error } = await supabase.from('judge_tests').delete().eq('id', test.id);
    if (error) return toast.error(`Could not delete: ${error.message}`);
    toast.success('Test deleted.');
    load();
  };

  const removeProblem = async (p: JudgeProblem) => {
    const used = usedIn(p.id);
    if (used.length) return toast.error(`"${p.title}" is used in ${used.map((t) => `"${t.title}"`).join(', ')}. Remove it from ${used.length === 1 ? 'that test' : 'those tests'} first.`);
    if (!(await confirm({ title: `Delete "${p.title}"?`, body: 'It is removed from the problem bank. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const { error } = await supabase.from('judge_problems').delete().eq('id', p.id);
    if (error) return toast.error(`Could not delete: ${error.message}`);
    toast.success('Problem deleted.');
    load();
  };

  return (
    <div className="space-y-4">
      {judge && !judge.reachable && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <Server className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{judge.configured ? 'The judge server is not answering right now. Students can still submit; their code is judged when it is back.' : 'The judge server is not connected yet. You can prepare problems and tests, and students can submit; submissions are judged once it is connected.'}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[{ id: 'tests', label: 'Coding tests', icon: Code2, count: tests?.length }, { id: 'bank', label: 'Problem bank', icon: BookOpen, count: bank.length }]} value={tab} onChange={setTab} />
        {tab === 'tests'
          ? <Button icon={Plus} onClick={() => setEditingTest('new')}>New test</Button>
          : <Button icon={Plus} onClick={() => setEditingProblem('new')}>New problem</Button>}
      </div>

      <Card>
        {tab === 'tests' ? (
          tests === null ? <p className="py-12 text-center text-sm text-slate-500">Loading…</p> : tests.length === 0 ? (
            <EmptyState icon={Code2} title="No coding tests yet" body="Add problems to the problem bank, then create a test (lab test, exam, assignment, practice or contest) and open it for a semester." action={<Button icon={Plus} onClick={() => setEditingTest('new')}>New test</Button>} />
          ) : (
            <div className={table.wrap}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Test</th><th className={table.th}>For</th><th className={table.th}>Problems</th><th className={table.th}>Time</th>
                    <th className={table.th}>Status</th><th className={table.th}>Joined</th><th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {tests.map((t) => (
                    <tr key={t.id} className={table.row}>
                      <td className={table.td}>
                        <span className="font-medium text-slate-900">{t.title}</span>
                        <span className="block text-xs text-slate-500">{KINDS[t.kind].label} · {t.languages.map((l) => LANGUAGES[l].label).join(', ')}{t.strict ? ' · strict' : ''}{isHod && t.author_name ? ` · ${t.author_name}` : ''}</span>
                      </td>
                      <td className={cx(table.td, 'whitespace-nowrap')}>{t.semester ? `Semester ${t.semester}` : <span className="text-slate-500">Link only</span>}</td>
                      <td className={cx(table.td, 'tabular-nums')}>{t.problems.length}</td>
                      <td className={cx(table.td, 'whitespace-nowrap text-xs')}>{t.duration_minutes ? `${t.duration_minutes} min` : '—'}{t.ends_at ? <span className="block text-slate-500">until {new Date(t.ends_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> : null}</td>
                      <td className={table.td}><Badge tone={STATUS[t.status].tone} dot>{STATUS[t.status].label}</Badge></td>
                      <td className={cx(table.td, 'tabular-nums')}>{t.joined}{t.blocked > 0 && <span className="ml-1 text-xs font-semibold text-rose-600">({t.blocked} blocked)</span>}</td>
                      <td className={cx(table.td, 'text-right')}>
                        <div className="flex justify-end gap-1">
                          {t.status !== 'open'
                            ? <Button size="xs" variant="success" icon={Play} loading={busy === t.id} onClick={() => manage(t, 'open')}>{t.status === 'closed' ? 'Reopen' : 'Open'}</Button>
                            : <Button size="xs" variant="danger" icon={Square} loading={busy === t.id} onClick={() => manage(t, 'close')}>Close</Button>}
                          {t.status !== 'draft' && <Button size="xs" variant="secondary" icon={Share2} onClick={() => setSharing(t)}>Share</Button>}
                          <Button size="xs" variant="secondary" icon={BarChart3} onClick={() => setResults(t)}>Results</Button>
                          <Button size="xs" variant="ghost" icon={t.joined ? Lock : Pencil} onClick={() => setEditingTest(t)} aria-label={`Edit ${t.title}`} />
                          <Button size="xs" variant="ghost" icon={Trash2} onClick={() => removeTest(t)} aria-label={`Delete ${t.title}`} className="hover:bg-rose-50 hover:text-rose-600" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : bank.length === 0 ? (
          <EmptyState icon={BookOpen} title="The problem bank is empty" body="Write a problem with its statement, samples and hidden test cases. Every teacher can use the problems in the bank; only the author changes them." action={<Button icon={Plus} onClick={() => setEditingProblem('new')}>New problem</Button>} />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr><th className={table.th}>Problem</th><th className={table.th}>By</th><th className={table.th}>Cases</th><th className={table.th}>Limits</th><th className={table.th}>Used in</th><th className={table.th}><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className={table.body}>
                {bank.map((p) => (
                  <tr key={p.id} className={table.row}>
                    <td className={cx(table.td, 'font-medium text-slate-900')}>{p.title}</td>
                    <td className={cx(table.td, 'text-slate-600')}>{p.created_by === user?.id ? 'You' : p.author_name || '—'}</td>
                    <td className={cx(table.td, 'whitespace-nowrap tabular-nums')}>{p.samples.length} sample · {p.tests.length} hidden</td>
                    <td className={cx(table.td, 'whitespace-nowrap text-xs')}>{p.time_limit_ms / 1000} s · {p.memory_mb} MB</td>
                    <td className={cx(table.td, 'text-xs text-slate-600')}>{usedIn(p.id).length || '—'}</td>
                    <td className={cx(table.td, 'text-right')}>
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="ghost" icon={mine(p) ? Pencil : Eye} onClick={() => setEditingProblem(p)} aria-label={`${mine(p) ? 'Edit' : 'View'} ${p.title}`} />
                        {mine(p) && <Button size="xs" variant="ghost" icon={Trash2} onClick={() => removeProblem(p)} aria-label={`Delete ${p.title}`} className="hover:bg-rose-50 hover:text-rose-600" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingTest && (
        <TestEditor test={editingTest === 'new' ? null : editingTest} bank={bank.filter((p) => allCases(p).length)} locked={editingTest !== 'new' && editingTest.joined > 0}
          authorName={user?.name || user?.email || ''} onClose={() => setEditingTest(null)} onSaved={() => { setEditingTest(null); load(); }} />
      )}
      {editingProblem && (
        <ProblemEditor problem={editingProblem === 'new' ? null : editingProblem} readOnly={editingProblem !== 'new' && !mine(editingProblem)}
          authorName={user?.name || user?.email || ''} onClose={() => setEditingProblem(null)} onSaved={() => { setEditingProblem(null); load(); }} />
      )}
      {results && <TestResults test={results} bank={bank} isHod={isHod} onClose={() => { setResults(null); load(); }} />}
      {sharing && <ShareTest test={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

function ShareTest({ test, onClose }: { test: JudgeTest; onClose: () => void }) {
  const toast = useToast();
  const link = `${window.location.origin}/judge/${test.code}`;
  const message = `${test.title}\nJoin: ${link}\nPassword: ${test.password}${test.duration_minutes ? `\nTime: ${test.duration_minutes} minutes` : ''}${test.strict ? '\nRules: no copy/paste; do not leave the page (2nd time = blocked).' : ''}`;
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error('Could not copy — select the text and copy it.'));
  return (
    <Modal title="Share the test" description={test.semester ? `Semester ${test.semester} students also see it in their portal (no password needed).` : 'Only people with the link and password can join.'} onClose={onClose}>
      <div className="space-y-4">
        {[['Link', link], ['Password', test.password]].map(([label, value]) => (
          <div key={label}>
            <p className="mb-1 text-sm font-medium text-slate-700">{label}</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm">{value}</code>
              <Button variant="secondary" icon={Copy} onClick={() => copy(value, label)} aria-label={`Copy ${label}`} />
            </div>
          </div>
        ))}
        <Button className="w-full" icon={Copy} onClick={() => copy(message, 'Message')}>Copy message for WhatsApp / Messenger</Button>
        {test.status !== 'open' && <p className="text-xs text-amber-700">The test is {test.status} — nobody can join until you open it.</p>}
      </div>
    </Modal>
  );
}
