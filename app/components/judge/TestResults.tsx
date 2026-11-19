'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, Code2, FileDown, Gavel, RefreshCw, RotateCcw, ShieldCheck, Unlock } from 'lucide-react';
import Modal from '../Modal';
import { Badge, Button, cx, table } from '../ui';
import { useConfirm, useToast } from '../Providers';
import { supabase } from '../../../utils/supabase';
import { KINDS, LANGUAGES, VERDICTS, standings, testPoints, type JudgeParticipant, type JudgeProblem, type JudgeSubmission, type JudgeTest } from '../../../utils/judge';

type Sub = Omit<JudgeSubmission, 'source'>;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const letter = (i: number) => String.fromCharCode(65 + i);

// Everyone in a test: ranking, marks per problem, strict-mode warnings, blocked students
// (only the HOD unblocks), each person's submissions with their code, Excel download.
export default function TestResults({ test, bank, isHod, onClose }: { test: JudgeTest; bank: JudgeProblem[]; isHod: boolean; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [people, setPeople] = useState<JudgeParticipant[] | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [code, setCode] = useState<{ sub: Sub; source: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    Promise.all([
      supabase.from('judge_participants').select('id, test_id, student_id, roll, name, started_at, finished_at, warnings, violations, blocked, blocked_at').eq('test_id', test.id),
      supabase.from('judge_submissions').select('id, test_id, participant_id, problem_id, language, status, passed, total, points, score, time_ms, memory_kb, failed_test, message, created_at, judged_at').eq('test_id', test.id).order('created_at', { ascending: false }),
    ]).then(([p, s]) => {
      if (p.error) return toast.error(`Could not load: ${p.error.message}`);
      setPeople((p.data ?? []) as JudgeParticipant[]);
      setSubs((s.data ?? []) as Sub[]);
    });
  }, [test.id, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const manage = async (action: string, extra: Record<string, string>, done: string) => {
    setBusy(action + (extra.participantId ?? extra.submissionId ?? ''));
    const res = await fetch('/api/judge/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: test.id, action, ...extra }) });
    const body = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) return toast.error(body.error ?? 'Could not do that.');
    toast.success(typeof done === 'string' ? done : 'Done.');
    load();
    return body;
  };

  const unblock = async (p: JudgeParticipant) => {
    if (!(await confirm({ title: `Unblock ${p.roll}?`, body: `${p.name} can continue the test${test.duration_minutes ? ' (their timer kept running)' : ''}. Their warnings start again from zero.`, confirmLabel: 'Unblock' }))) return;
    manage('unblock', { participantId: p.id }, `${p.roll} is unblocked.`);
  };
  const reset = async (p: JudgeParticipant) => {
    if (!(await confirm({ title: `Reset ${p.roll}?`, body: `${p.name}'s place, submissions and marks in this test are deleted so they can start again from the beginning.`, confirmLabel: 'Reset', tone: 'danger' }))) return;
    manage('reset', { participantId: p.id }, `${p.roll} can start again.`);
  };
  const showCode = async (sub: Sub) => {
    const { data, error } = await supabase.from('judge_submissions').select('source').eq('id', sub.id).single();
    if (error) return toast.error(error.message);
    setCode({ sub, source: data.source });
  };

  const problems = test.problems.map((p, i) => ({ ...p, i, title: bank.find((b) => b.id === p.id)?.title ?? '(deleted)' }));
  const rows = people ? standings(test, people, subs) : [];
  const contest = test.kind === 'contest', practice = test.kind === 'practice';
  const waiting = subs.filter((s) => s.status === 'pending' || s.status === 'running').length;
  const blocked = (people ?? []).filter((p) => p.blocked).length;
  const status = (p: JudgeParticipant) => (p.blocked ? 'Blocked' : p.finished_at ? 'Finished' : 'Working');

  const download = async () => {
    const XLSX = await import('xlsx');
    const head = ['Rank', 'Roll', 'Name', ...problems.map((p) => `${letter(p.i)}. ${p.title}`), contest ? 'Solved' : `Total (of ${testPoints(test)})`, ...(contest ? ['Penalty'] : []), 'Warnings', 'Status', 'Left the page at'];
    const sheet = XLSX.utils.aoa_to_sheet([
      [test.title], [`${KINDS[test.kind].label} · ${test.semester ? `Semester ${test.semester}` : 'Link only'}`], [],
      head,
      ...rows.map((r, i) => [
        i + 1, r.participant.roll, r.participant.name,
        ...r.problems.map((x) => (contest ? (x.solved ? `Yes (${x.tries})` : x.tries ? `No (${x.tries})` : '') : x.score)),
        r.total, ...(contest ? [r.penalty] : []), r.participant.warnings, status(r.participant),
        r.participant.violations.map((v) => when(v.at)).join(', '),
      ]),
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Results');
    XLSX.writeFile(book, `${test.title.replace(/[\\/:*?"<>|]/g, '')} - results.xlsx`);
  };

  return (
    <Modal title={`Results — ${test.title}`} description={`${people?.length ?? 0} joined · ${blocked} blocked · ${subs.length} submissions${waiting ? ` · ${waiting} waiting for the judge` : ''}`} size="full" onClose={onClose}>
      {people === null ? <p className="py-8 text-center text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            {waiting > 0 && <Button size="sm" variant="secondary" icon={Gavel} loading={busy === 'process'} onClick={() => manage('process', {}, 'Sent the waiting submissions to the judge.')}>Judge waiting ({waiting})</Button>}
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
            <Button size="sm" variant="secondary" icon={FileDown} onClick={download} disabled={!rows.length}>Download Excel</Button>
          </div>
          {!isHod && blocked > 0 && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200">Blocked students can only be unblocked by the HOD.</p>}
          {rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nobody has joined this test yet.</p> : (
            <div className={table.wrap}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>#</th><th className={table.th}>Student</th>
                    {problems.map((p) => <th key={p.id} className={cx(table.th, 'text-center')} title={p.title}>{letter(p.i)}{!contest && !practice ? <span className="font-normal text-slate-400"> /{p.points}</span> : ''}</th>)}
                    <th className={table.th}>{contest ? 'Solved' : 'Total'}</th>{contest && <th className={table.th}>Penalty</th>}
                    <th className={table.th}>Strict mode</th><th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {rows.map((r, i) => {
                    const p = r.participant;
                    const mine = subs.filter((s) => s.participant_id === p.id);
                    return [
                      <tr key={p.id} className={cx(table.row, p.blocked && 'bg-rose-50/60')}>
                        <td className={cx(table.td, 'text-slate-500')}>{i + 1}</td>
                        <td className={table.td}><span className="font-medium text-slate-900">{p.name}</span><span className="block font-mono text-xs text-slate-500">{p.roll}</span></td>
                        {r.problems.map((x, k) => (
                          <td key={k} className={cx(table.td, 'text-center tabular-nums', x.solved ? 'text-emerald-700' : x.tries ? 'text-rose-700' : 'text-slate-300')}>
                            {x.pending ? '…' : contest || practice ? (x.solved ? `✓${x.tries > 1 ? ` (${x.tries})` : ''}` : x.tries ? `−${x.tries}` : '·') : x.tries || x.score ? x.score : '·'}
                          </td>
                        ))}
                        <td className={cx(table.td, 'font-bold tabular-nums')}>{r.total}</td>
                        {contest && <td className={cx(table.td, 'tabular-nums')}>{r.penalty}</td>}
                        <td className={table.td}>
                          {p.blocked ? <Badge tone="rose" dot>Blocked</Badge> : p.warnings ? <Badge tone="amber" dot>Warned {p.warnings}×</Badge> : <Badge tone={p.finished_at ? 'slate' : 'emerald'} dot>{p.finished_at ? 'Finished' : 'OK'}</Badge>}
                          {p.violations.length > 0 && <span className="mt-0.5 block text-[11px] text-slate-500" title={p.violations.map((v) => `${when(v.at)} — ${v.kind}`).join('\n')}>left {p.violations.length}× · last {when(p.violations[p.violations.length - 1].at)}</span>}
                        </td>
                        <td className={cx(table.td, 'text-right')}>
                          <div className="flex justify-end gap-1">
                            {p.blocked && isHod && <Button size="xs" variant="success" icon={Unlock} loading={busy === `unblock${p.id}`} onClick={() => unblock(p)}>Unblock</Button>}
                            <Button size="xs" variant="secondary" icon={Code2} onClick={() => setOpen(open === p.id ? null : p.id)}>{mine.length}</Button>
                            {(!p.blocked || isHod) && <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => reset(p)} aria-label={`Reset ${p.roll}`} className="hover:bg-rose-50 hover:text-rose-600" />}
                          </div>
                        </td>
                      </tr>,
                      open === p.id && (
                        <tr key={`${p.id}-subs`}>
                          <td colSpan={problems.length + (contest ? 6 : 5)} className="bg-slate-50 px-4 py-3">
                            {p.violations.length > 0 && (
                              <p className="mb-2 flex flex-wrap items-center gap-x-3 text-xs text-rose-800"><Ban className="size-3.5" aria-hidden /> Left the page: {p.violations.map((v) => `${when(v.at)} (${v.kind})`).join(' · ')}</p>
                            )}
                            {mine.length === 0 ? <p className="text-xs text-slate-500">No submissions.</p> : (
                              <ul className="divide-y divide-slate-200 text-sm">
                                {mine.map((s) => {
                                  const pr = problems.find((x) => x.id === s.problem_id);
                                  return (
                                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                      <span className="flex items-center gap-2">
                                        <b className="text-slate-600">{pr ? letter(pr.i) : '?'}</b>
                                        <Badge tone={VERDICTS[s.status].tone} dot>{VERDICTS[s.status].label}</Badge>
                                        {s.passed !== null && s.total !== null && <span className="text-xs text-slate-500">{s.passed}/{s.total}</span>}
                                        {!contest && !practice && s.score !== null && <span className="text-xs font-semibold">{Number(s.score)}/{s.points}</span>}
                                      </span>
                                      <span className="flex items-center gap-2 text-xs text-slate-500">
                                        {LANGUAGES[s.language].label} · {when(s.created_at)}
                                        <Button size="xs" variant="ghost" icon={Code2} onClick={() => showCode(s)}>Code</Button>
                                        <Button size="xs" variant="ghost" icon={ShieldCheck} loading={busy === `rejudge${s.id}`} onClick={() => manage('rejudge', { submissionId: s.id }, 'Sent to the judge again.')}>Rejudge</Button>
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {code && (
        <Modal title={`${people?.find((p) => p.id === code.sub.participant_id)?.roll ?? ''} — ${LANGUAGES[code.sub.language].label}`} description={`${VERDICTS[code.sub.status].label} · ${when(code.sub.created_at)}`} size="xl" onClose={() => setCode(null)}>
          <pre className="max-h-[65vh] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100">{code.source}</pre>
          {code.sub.message && <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-rose-50 p-3 font-mono text-xs text-rose-900">{code.sub.message}</pre>}
        </Modal>
      )}
    </Modal>
  );
}
