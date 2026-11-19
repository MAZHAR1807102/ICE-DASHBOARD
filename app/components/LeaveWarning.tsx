'use client';

import { AlertTriangle, Ban } from 'lucide-react';
import { Button, Card } from './ui';

// Strict mode screens shared by MCQ exams and coding tests.

// After the first time the person left the page.
export function LeaveWarning({ what, onClose }: { what: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="leave-warning">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-amber-500 px-5 py-4 text-white">
          <AlertTriangle className="size-7 shrink-0" aria-hidden />
          <p id="leave-warning" className="text-lg font-bold">Warning: you left the {what} page</p>
        </div>
        <div className="space-y-3 p-5 text-sm text-slate-700">
          <p>This has been recorded and your teacher can see it.</p>
          <p className="font-semibold text-rose-700">If you leave the page again, you will be logged out and blocked from this {what} until the HOD unblocks you.</p>
          <Button className="w-full" onClick={onClose}>I understand — back to the {what}</Button>
        </div>
      </div>
    </div>
  );
}

// After the second time (or when a blocked person opens the link again).
export function BlockedNotice({ what }: { what: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center gap-3 bg-rose-600 px-6 py-8 text-center text-white">
        <Ban className="size-10" aria-hidden />
        <h1 className="text-xl font-bold">You are blocked from this {what}</h1>
      </div>
      <div className="space-y-2 p-6 text-center text-sm text-slate-600">
        <p>You left the {what} page a second time, so you were logged out and blocked.</p>
        <p>Only the <b>HOD</b> can unblock you. Contact your teacher or the department.</p>
      </div>
    </Card>
  );
}

// The rules, shown before starting.
export function StrictRules({ what, closingCounts, extra }: { what: string; closingCounts: boolean; extra?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
      <p className="font-bold">Rules of this {what}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {extra}
        <li><b>Do not leave the {what} page</b> — no other tabs, apps or windows{closingCounts ? ', and do not close or reload the page' : ''}.</li>
        <li>The <b>first time</b> you leave, you get a warning. The <b>second time</b>, you are <b>logged out and blocked</b> until the HOD unblocks you.</li>
      </ul>
    </div>
  );
}
