'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Code2, ListChecks } from 'lucide-react';
import { Card } from './ui';

type Mcq = {
  open: { title: string; code: string; duration: number; count: number; started: boolean; blocked: boolean }[];
  taken: { title: string; code: string; done: boolean; score: number | null; total: number | null; blocked: boolean }[];
};
type Judge = {
  open: { title: string; code: string; kind: string; count: number; duration: number | null; endsAt: string | null; state: 'new' | 'started' | 'finished' | 'blocked' }[];
  past: { title: string; code: string; kind: string; contest: boolean; practice: boolean; total: number; outOf: number; solved: number; blocked: boolean; at: string }[];
};

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Student portal tab: MCQ exams and coding tests (lab tests, exams, assignments, practice, contests)
// published for the student's semester — open ones to start or continue, and past results.
export default function OnlineTestsTab() {
  const [mcq, setMcq] = useState<Mcq | null>(null);
  const [judge, setJudge] = useState<Judge | null>(null);
  useEffect(() => {
    fetch('/api/mcq/mine').then((r) => (r.ok ? r.json() : { open: [], taken: [] })).then(setMcq).catch(() => setMcq({ open: [], taken: [] }));
    fetch('/api/judge/mine').then((r) => (r.ok ? r.json() : { open: [], past: [] })).then(setJudge).catch(() => setJudge({ open: [], past: [] }));
  }, []);

  const mcqOpen = (mcq?.open ?? []).filter((e) => !mcq?.taken.some((t) => t.code === e.code && t.done));
  const mcqDone = (mcq?.taken ?? []).filter((t) => t.done);
  const codeOpen = (judge?.open ?? []).filter((t) => t.state !== 'finished');
  const button = (href: string, label: string) => <Link href={href} className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{label}</Link>;
  const blockedTag = <span className="shrink-0 rounded-lg bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700">Blocked — ask the HOD</span>;
  const row = (key: string, icon: React.ReactNode, title: string, sub: string, action: React.ReactNode) => (
    <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{title}</p><p className="text-xs text-slate-500">{sub}</p></div>
      </div>
      {action}
    </li>
  );

  if (!mcq || !judge) return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <Card title="Open now">
        {!mcqOpen.length && !codeOpen.length ? <p className="py-4 text-sm text-slate-500">Nothing is open for your semester right now. Tests appear here when your teacher opens them.</p> : (
          <ul className="divide-y divide-slate-100">
            {mcqOpen.map((e) => row(`m${e.code}`, <ListChecks className="size-5" />, `MCQ exam: ${e.title}`, `${e.count} questions · ${e.duration} minutes${e.started ? ' · in progress' : ''}`,
              e.blocked ? blockedTag : button(`/mcq/${e.code}`, e.started ? 'Continue' : 'Start')))}
            {codeOpen.map((t) => row(`j${t.code}`, <Code2 className="size-5" />, `${t.kind}: ${t.title}`,
              `${t.count} problem${t.count === 1 ? '' : 's'}${t.duration ? ` · ${t.duration} minutes` : ''}${t.endsAt ? ` · until ${when(t.endsAt)}` : ''}${t.state === 'started' ? ' · in progress' : ''}`,
              t.state === 'blocked' ? blockedTag : button(`/judge/${t.code}`, t.state === 'started' ? 'Continue' : 'Open')))}
          </ul>
        )}
      </Card>
      <Card title="My results">
        {!mcqDone.length && !judge.past.length ? <p className="py-4 text-sm text-slate-500">You haven’t finished any online test yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {judge.past.map((t) => row(`p${t.code}`, <Code2 className="size-5" />, `${t.kind}: ${t.title}`, `${when(t.at)}${t.blocked ? ' · blocked' : ''}`,
              <span className="shrink-0 text-right">
                <b className="text-lg tabular-nums text-slate-900">{t.contest || t.practice ? `${t.solved}/${t.outOf}` : `${t.total}/${t.outOf}`}</b>
                <span className="block text-xs text-slate-500">{t.contest || t.practice ? 'solved' : 'marks'}</span>
              </span>))}
            {mcqDone.map((t) => row(`d${t.code}`, <ListChecks className="size-5" />, `MCQ exam: ${t.title}`, t.blocked ? 'blocked' : 'see your answers',
              <Link href={`/mcq/${t.code}`} className="shrink-0 text-right"><b className="text-lg tabular-nums text-slate-900">{t.score ?? '…'}/{t.total ?? '…'}</b><span className="block text-xs text-indigo-600">Review</span></Link>))}
          </ul>
        )}
      </Card>
    </div>
  );
}
