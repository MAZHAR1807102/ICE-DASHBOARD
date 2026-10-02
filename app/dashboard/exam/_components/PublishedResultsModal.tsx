'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileStack, Pencil, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, EmptyState, cx, inputClass } from '../../../components/ui';
import { useToast } from '../../../components/Providers';
import ReasonDialog from './ReasonDialog';
import { supabase } from '../../../../utils/supabase';

type Row = { semester: number; exam_key: string; course_code: string; student_id: string; published_at: string; published_by_name: string | null };
type Publication = {
  semester: number;
  examKey: string;
  title: string;
  courses: { code: string; count: number }[];
  students: number;
  publishedAt: string;
  publishedBy: string | null;
};

// Reads every row in pages of 1000 (the API's per-request limit).
async function fetchAll<T>(table: string, columns: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

// Groups every published grade by sheet (semester + exam).
async function fetchPublications(): Promise<Publication[]> {
  const [rows, sheets] = await Promise.all([
    fetchAll<Row>('course_results', 'semester, exam_key, course_code, student_id, published_at, published_by_name'),
    fetchAll<{ semester: number; exam_key: string; exam_title: string | null }>('semester_results', 'semester, exam_key, exam_title'),
  ]);
  const groups = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = `${r.semester}|${r.exam_key}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  return [...groups.values()]
    .map((g): Publication => {
      const { semester, exam_key } = g[0];
      const counts = g.reduce<Record<string, number>>((m, r) => ((m[r.course_code] = (m[r.course_code] ?? 0) + 1), m), {});
      const latest = g.reduce((a, b) => (a.published_at > b.published_at ? a : b));
      const title = sheets.find((s) => s.semester === semester && s.exam_key === exam_key)?.exam_title;
      return {
        semester,
        examKey: exam_key,
        title: title || exam_key || 'Entered with the simple template',
        courses: Object.entries(counts).map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code)),
        students: new Set(g.map((r) => r.student_id)).size,
        publishedAt: latest.published_at,
        publishedBy: latest.published_by_name,
      };
    })
    .sort((a, b) => a.semester - b.semester || a.publishedAt.localeCompare(b.publishedAt));
}

// Every published sheet (semester + exam), with ways to fix a misread course code or remove it entirely.
export default function PublishedResultsModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [publications, setPublications] = useState<Publication[] | null>(null);
  const [renaming, setRenaming] = useState<{ pub: Publication; from: string; to: string } | null>(null);
  const [reasonFor, setReasonFor] = useState<{ title: string; summary: string; danger?: boolean; confirmLabel: string; run: (reason: string) => Promise<void> } | null>(null);
  const busy = reasonFor !== null;

  const load = useCallback(() =>
    fetchPublications()
      .then(setPublications)
      .catch((err) => {
        toast.error(`Could not load published results: ${err instanceof Error ? err.message : err}`);
        setPublications([]);
      }), [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = (pub: Publication) => setReasonFor({
    title: 'Remove this publication?',
    summary: `Semester ${pub.semester} · ${pub.title} — ${pub.students} students, ${pub.courses.length} courses. Grades and official figures from this sheet are deleted and every affected CGPA is recalculated.`,
    danger: true,
    confirmLabel: 'Remove publication',
    run: async (reason) => {
      const { error } = await supabase.rpc('remove_publication', { p_semester: pub.semester, p_exam_key: pub.examKey, p_reason: reason });
      if (error) return toast.error(`Not removed: ${error.message}`);
      toast.success(`Removed semester ${pub.semester} · ${pub.title}.`);
      setReasonFor(null);
      load();
      onChanged();
    },
  });

  const handleRename = () => {
    if (!renaming) return;
    const { pub, from } = renaming;
    const to = renaming.to.toUpperCase().replace(/\s+/g, '');
    if (!to || to === from) return setRenaming(null);
    if (pub.courses.some((c) => c.code === to)) return toast.error(`${to} is already on this sheet — remove or rename that one first.`);
    setReasonFor({
      title: `Rename ${from} to ${to}?`,
      summary: `Semester ${pub.semester} · ${pub.title} — ${pub.courses.find((c) => c.code === from)?.count ?? 0} grades.`,
      confirmLabel: 'Rename',
      run: async (reason) => {
        const { error } = await supabase.rpc('rename_published_course', { p_semester: pub.semester, p_exam_key: pub.examKey, p_from: from, p_to: to, p_reason: reason });
        if (error) return toast.error(`Not renamed: ${error.message}`);
        toast.success(`${from} renamed to ${to} for semester ${pub.semester}.`);
        setReasonFor(null);
        setRenaming(null);
        load();
        onChanged();
      },
    });
  };

  return (
    <Modal title="Published results" description="Every result sheet published so far. Fix a misread course code, or remove a sheet to upload it again." size="xl" onClose={onClose}>
      {publications === null ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : publications.length === 0 ? (
        <EmptyState icon={FileStack} title="Nothing published yet" />
      ) : (
        <ul className="space-y-3">
          {publications.map((pub) => (
            <li key={`${pub.semester}|${pub.examKey}`} className="rounded-xl p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="indigo">Semester {pub.semester}</Badge>
                    {/improvement|retake|re-?take/i.test(pub.title) && <Badge tone="amber">Retake / improvement</Badge>}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-900">{pub.title}</p>
                  <p className="text-xs text-slate-500">
                    {pub.students} students · {new Date(pub.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {pub.publishedBy && ` · ${pub.publishedBy}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => handleRemove(pub)} className="text-rose-600 hover:bg-rose-50">Remove</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pub.courses.map((c) => {
                  const editing = renaming?.pub === pub && renaming.from === c.code;
                  return editing ? (
                    <form key={c.code} onSubmit={(e) => { e.preventDefault(); handleRename(); }} className="flex items-center gap-1">
                      <input
                        autoFocus value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value.toUpperCase() })}
                        aria-label={`New code for ${c.code}`} className={cx(inputClass, 'h-7 w-28 font-mono text-xs')}
                      />
                      <Button type="submit" size="xs" loading={busy}>Save</Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <button
                      key={c.code}
                      onClick={() => setRenaming({ pub, from: c.code, to: c.code })}
                      className="group inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                      title="Rename this course code"
                    >
                      {c.code} <span className="font-sans text-slate-400">×{c.count}</span>
                      <Pencil className="size-3 text-slate-400 group-hover:text-indigo-500" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {reasonFor && <ReasonDialog {...reasonFor} onCancel={() => setReasonFor(null)} onConfirm={reasonFor.run} />}
    </Modal>
  );
}
