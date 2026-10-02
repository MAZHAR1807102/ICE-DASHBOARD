'use client';

import { useState } from 'react';
import { supabase } from '../../../../utils/supabase';
import { useSessionUser } from '../../../../utils/useSessionUser';
import type { Notice } from '../../../../utils/types';

export default function NoticesTab({ notices, onChanged, showMessage }: {
  notices: Notice[];
  onChanged: () => void;
  showMessage: (msg: string) => void;
}) {
  const user = useSessionUser();
  const [form, setForm] = useState({ title: '', description: '', file_url: '' });

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description) return alert('Title and Description are required.');
    const { error } = await supabase.from('department_notices').insert([{ ...form, posted_by: user?.name ?? '' }]);
    if (error) return alert(`Error posting notice: ${error.message}`);
    showMessage('Notice broadcasted to all students!');
    setForm({ title: '', description: '', file_url: '' });
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this notice permanently?')) return;
    await supabase.from('department_notices').delete().eq('id', id);
    onChanged();
  };

  const inputClass = 'w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-800';

  return (
    <div className="p-6 space-y-8 bg-slate-50/50">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 pb-3 mb-5">
          <h3 className="text-lg font-bold text-slate-800">Broadcast Notice to Student Portals</h3>
          <p className="text-xs text-slate-500 mt-1">These announcements will appear instantly on all student dashboards.</p>
        </div>
        <form onSubmit={handlePost} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Notice Title *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g., Final Exam Registration Deadline" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Description *</label>
            <textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Provide full details here..." />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Attachment Link (Optional)</label>
            <input type="url" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} className={inputClass} placeholder="e.g., Google Drive link to PDF" />
          </div>
          <div className="pt-2 flex justify-end">
            <button type="submit" className="px-6 py-2.5 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 shadow-md">📢 Post Broadcast</button>
          </div>
        </form>
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Currently Live Notices</h3>
        <div className="space-y-4">
          {notices.map((notice) => (
            <div key={notice.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-indigo-600 mb-1">{new Date(notice.created_at).toLocaleDateString()} • By {notice.posted_by}</p>
                <h4 className="font-bold text-slate-900 text-lg mb-1">{notice.title}</h4>
                <p className="text-sm text-slate-600 mb-3 whitespace-pre-wrap">{notice.description}</p>
                {notice.file_url && <a href={notice.file_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 hover:underline">📄 View Attachment Link</a>}
              </div>
              <button onClick={() => handleDelete(notice.id)} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded text-xs font-bold hover:bg-rose-100">Delete</button>
            </div>
          ))}
          {notices.length === 0 && <p className="text-sm text-slate-500">No active notices.</p>}
        </div>
      </div>
    </div>
  );
}
