'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Code2 } from 'lucide-react';

type Mine = { open: { title: string; code: string; kind: string; count: number; duration: number | null; endsAt: string | null; state: 'new' | 'started' | 'finished' | 'blocked' }[] };

// Student portal strip: coding tests open for the student's semester. Shows nothing when there are none.
export default function JudgeTests() {
  const [mine, setMine] = useState<Mine | null>(null);
  useEffect(() => {
    fetch('/api/judge/mine').then((r) => (r.ok ? r.json() : null)).then(setMine).catch(() => {});
  }, []);
  const list = (mine?.open ?? []).filter((t) => t.state !== 'finished');
  if (!list.length) return null;

  return (
    <div className="border-b border-slate-200 bg-slate-100">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
        {list.map((t) => (
          <div key={t.code} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><Code2 className="size-5" aria-hidden /></span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{t.kind}: {t.title}</p>
                <p className="text-xs text-slate-500">
                  {t.count} problem{t.count === 1 ? '' : 's'}{t.duration ? ` · ${t.duration} minutes` : ''}
                  {t.endsAt ? ` · until ${new Date(t.endsAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  {t.state === 'started' ? ' · in progress' : ''}
                </p>
              </div>
            </div>
            {t.state === 'blocked'
              ? <span className="rounded-lg bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">Blocked — ask the HOD</span>
              : <Link href={`/judge/${t.code}`} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">{t.state === 'started' ? 'Continue' : 'Open'}</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
