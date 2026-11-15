'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';

type Mine = {
  open: { title: string; code: string; duration: number; count: number; started: boolean }[];
  taken: { title: string; code: string; done: boolean; score: number | null; total: number | null }[];
};

// Student portal strip: MCQ exams open for the student's semester, and their recent scores.
// Shows nothing when there are none.
export default function McqExams() {
  const [mine, setMine] = useState<Mine | null>(null);
  useEffect(() => {
    fetch('/api/mcq/mine').then((r) => (r.ok ? r.json() : null)).then(setMine).catch(() => {});
  }, []);

  const waiting = (mine?.open ?? []).filter((e) => !mine?.taken.some((t) => t.code === e.code && t.done));
  const results = (mine?.taken ?? []).filter((t) => t.done).slice(0, 5);
  if (!waiting.length && !results.length) return null;

  return (
    <div className="border-b border-indigo-100 bg-indigo-50">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
        {waiting.map((e) => (
          <div key={e.code} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-indigo-200">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"><ListChecks className="size-5" aria-hidden /></span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">MCQ exam: {e.title}</p>
                <p className="text-xs text-slate-500">{e.count} questions · {e.duration} minutes{e.started ? ' · in progress' : ''}</p>
              </div>
            </div>
            <Link href={`/mcq/${e.code}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{e.started ? 'Continue' : 'Start exam'}</Link>
          </div>
        ))}
        {results.length > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-indigo-900">
            <span className="font-semibold">MCQ results:</span>
            {results.map((t) => (
              <Link key={t.code} href={`/mcq/${t.code}`} className="underline-offset-2 hover:underline">{t.title} — {t.score ?? '…'}/{t.total ?? '…'}</Link>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
