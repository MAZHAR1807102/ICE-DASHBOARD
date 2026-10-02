'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, inputClass } from '../../../components/ui';

const QUICK = ['Typing mistake', 'Corrected by the exam board', 'Missing from the RU sheet', 'Misread from the file', 'Entered by mistake'];

// Every change to a published result needs a reason; it is kept in the change history.
export default function ReasonDialog({ title, summary, confirmLabel = 'Save change', danger, onCancel, onConfirm }: {
  title: string;
  summary?: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setBusy(true);
    await onConfirm(reason.trim());
    setBusy(false);
  };

  return (
    <Modal title={title} description={summary} size="md" onClose={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason for this change" hint="Kept permanently in the result history with your name.">
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Corrected by the exam board" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setReason(q)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">{q}</button>
          ))}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} icon={ShieldCheck} loading={busy} disabled={reason.trim().length < 3}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
