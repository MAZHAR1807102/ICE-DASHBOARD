import type { Notice } from '../../../utils/types';
import { EmptyState, formatDate } from './ui';

export default function NoticesList({ notices, limit }: { notices: Notice[]; limit?: number }) {
  const shown = limit ? notices.slice(0, limit) : notices;
  if (shown.length === 0) return <EmptyState icon="📢" title="No notices" body="Department announcements will show up here." />;

  return (
    <ul className="divide-y divide-slate-100 -my-2">
      {shown.map((n) => (
        <li key={n.id} className="py-4">
          <p className="text-xs font-semibold text-indigo-600">{formatDate(n.created_at)}{n.posted_by && ` · ${n.posted_by}`}</p>
          <h3 className="font-bold text-slate-900 mt-0.5">{n.title}</h3>
          {n.description && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{n.description}</p>}
          {n.file_url && (
            <a href={n.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-indigo-600 hover:underline">
              📄 View attachment
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
