'use client';

import { useState } from 'react';
import { Megaphone, Paperclip, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { useSessionUser } from '../../../../utils/useSessionUser';
import type { Notice } from '../../../../utils/types';
import { Button, EmptyState, Field, inputClass } from '../../../components/ui';
import { useConfirm } from '../../../components/Providers';

export default function NoticesTab({ notices, onChanged, showMessage }: {
  notices: Notice[];
  onChanged: () => void;
  showMessage: (msg: string) => void;
}) {
  const user = useSessionUser();
  const confirm = useConfirm();
  const [form, setForm] = useState({ title: '', description: '', file_url: '' });
  const [isPosting, setIsPosting] = useState(false);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPosting(true);
    const { error } = await supabase.from('department_notices').insert([{ ...form, posted_by: user?.name ?? '' }]);
    setIsPosting(false);
    if (error) return showMessage(`Error posting notice: ${error.message}`);
    showMessage('Notice published to every student portal.');
    setForm({ title: '', description: '', file_url: '' });
    onChanged();
  };

  const handleDelete = async (notice: Notice) => {
    if (!(await confirm({ title: 'Delete this notice?', body: notice.title, confirmLabel: 'Delete', tone: 'danger' }))) return;
    await supabase.from('department_notices').delete().eq('id', notice.id);
    onChanged();
  };

  return (
    <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-5">
      <form onSubmit={handlePost} className="space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5 lg:col-span-2 lg:self-start">
        <div>
          <p className="font-semibold text-slate-900">New broadcast</p>
          <p className="text-sm text-slate-500">Appears instantly on every student&apos;s portal.</p>
        </div>
        <Field label="Title">
          <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g. Exam registration deadline" />
        </Field>
        <Field label="Details">
          <textarea required rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Attachment link (optional)">
          <input type="url" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} className={inputClass} placeholder="https://drive.google.com/…" />
        </Field>
        <Button type="submit" icon={Send} loading={isPosting} className="w-full">Publish notice</Button>
      </form>

      <div className="lg:col-span-3">
        <p className="mb-3 font-semibold text-slate-900">Currently Live Notices</p>
        {notices.length === 0 ? (
          <EmptyState icon={Megaphone} title="No notices" body="Published notices will appear here." />
        ) : (
          <ul className="space-y-3">
            {notices.map((notice) => (
              <li key={notice.id} className="group rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-indigo-600">
                      {new Date(notice.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{notice.posted_by && ` · ${notice.posted_by}`}
                    </p>
                    <h4 className="mt-0.5 font-semibold text-slate-900">{notice.title}</h4>
                  </div>
                  <Button size="xs" variant="ghost" icon={Trash2} onClick={() => handleDelete(notice)} aria-label="Delete notice" className="text-slate-400 hover:bg-rose-50 hover:text-rose-600" />
                </div>
                {notice.description && <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{notice.description}</p>}
                {notice.file_url && (
                  <a href={notice.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
                    <Paperclip className="size-3.5" aria-hidden /> Attachment
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
