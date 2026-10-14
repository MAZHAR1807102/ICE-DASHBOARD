'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Download, Eye, GraduationCap, Search, Trophy, Wallet } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { toCsv } from '../../../utils/csv';
import { sessionOf } from '../../../utils/rollsheet';
import { DEGREE_CREDITS, totalDue, type Student } from '../../../utils/types';
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, inputClass, table, taka } from '../../components/ui';
import { useToast } from '../../components/Providers';

const yearOf = (s: Student) => (s.graduated_at ? new Date(s.graduated_at).getFullYear() : null);

// Alumni: students who finished semester 8 and were graduated from Academic → Promote students.
export default function AlumniPage() {
  const toast = useToast();
  const [alumni, setAlumni] = useState<Student[] | null>(null);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('All');

  useEffect(() => {
    supabase
      .from('master_students')
      .select('*')
      .eq('status', 'graduated')
      .order('graduated_at', { ascending: false })
      .order('ru_id', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(`Could not load alumni: ${error.message}`);
        setAlumni((data ?? []) as Student[]);
      });
  }, [toast]);

  const years = useMemo(() => [...new Set((alumni ?? []).map(yearOf).filter((y): y is number => y !== null))].sort((a, b) => b - a), [alumni]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (alumni ?? []).filter((s) =>
      (year === 'All' || String(yearOf(s)) === year) &&
      (!q || s.name?.toLowerCase().includes(q) || (s.ru_id ?? '').includes(q) || s.college_id.includes(q)));
  }, [alumni, query, year]);

  const withCgpa = shown.filter((s) => Number(s.cgpa) > 0);
  const avgCgpa = withCgpa.length ? withCgpa.reduce((sum, s) => sum + Number(s.cgpa), 0) / withCgpa.length : 0;
  const owing = shown.filter((s) => totalDue(s) > 0);

  const download = () => {
    const csv = toCsv(
      ['Graduated', 'RU ID', 'College ID', 'Name', 'Session', 'CGPA', 'Credits earned', 'Phone', 'Guardian phone', 'Dues'],
      shown.map((s) => [yearOf(s) ?? '', s.ru_id ?? '', s.college_id, s.name, sessionOf(s), Number(s.cgpa || 0).toFixed(2), Number(s.credits_earned || 0), s.student_contact ?? '', s.guardian_contact ?? '', totalDue(s)]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Alumni${year === 'All' ? '' : ` ${year}`}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Alumni"
        description="Students who completed the degree. Graduate a semester 8 batch from Academic → Promote students."
        actions={<Button variant="secondary" icon={Download} onClick={download} disabled={shown.length === 0}>Download list (CSV)</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Alumni" value={alumni === null ? '—' : shown.length} hint={year === 'All' ? `${years.length} graduating year${years.length === 1 ? '' : 's'}` : `Graduated in ${year}`} icon={GraduationCap} tone="violet" />
        <StatCard label="Average CGPA" value={withCgpa.length ? avgCgpa.toFixed(2) : '—'} hint={`Out of 4.00 · ${DEGREE_CREDITS} credits for the degree`} icon={Trophy} tone="emerald" />
        <StatCard label="Still owing fees" value={owing.length} hint={owing.length ? taka(owing.reduce((sum, s) => sum + totalDue(s), 0)) : 'All cleared'} icon={Wallet} tone={owing.length ? 'rose' : 'emerald'} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" placeholder="Search name, RU ID or College ID" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} pl-9`} />
          </div>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={`${inputClass} sm:w-48`} aria-label="Graduation year">
            <option value="All">All years</option>
            {years.map((y) => <option key={y} value={y}>Graduated {y}</option>)}
          </select>
        </div>

        {alumni === null ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading alumni…</div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={alumni.length ? 'No alumni match' : 'No alumni yet'}
            body={alumni.length ? 'Try another name, ID or year.' : 'When a semester 8 batch finishes, graduate them from Academic → Promote students and they appear here.'}
          />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Graduate</th>
                  <th className={table.th}>Session</th>
                  <th className={`${table.th} text-center`}>CGPA</th>
                  <th className={`${table.th} text-center`}>Credits</th>
                  <th className={table.th}>Contact</th>
                  <th className={`${table.th} text-right`}>Dues</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {shown.map((s, i) => {
                  const y = yearOf(s);
                  const heading = i === 0 || yearOf(shown[i - 1]) !== y;
                  const due = totalDue(s);
                  return (
                    <Fragment key={s.id}>
                      {heading && (
                        <tr className="bg-violet-50/60">
                          <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                            {y ? `Graduated ${y}` : 'Graduation date not recorded'} · {shown.filter((x) => yearOf(x) === y).length}
                          </td>
                        </tr>
                      )}
                      <tr className={table.row}>
                        <td className={table.td}>
                          <p className="flex flex-wrap items-center gap-x-1.5 font-medium text-slate-900">
                            {s.name}
                            <a href={`/view-student/${s.id}`} target="_blank" rel="noopener" title="See their portal as they see it"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50">
                              <Eye className="size-3.5" aria-hidden /> View
                            </a>
                          </p>
                          <p className="text-xs text-slate-500">{s.college_id} · RU {s.ru_id || '—'}</p>
                        </td>
                        <td className={`${table.td} text-slate-600`}>{sessionOf(s) || '—'}</td>
                        <td className={`${table.td} text-center font-semibold tabular-nums`}>{Number(s.cgpa) > 0 ? Number(s.cgpa).toFixed(2) : '—'}</td>
                        <td className={`${table.td} text-center tabular-nums text-slate-600`}>{Number(s.credits_earned || 0)} / {DEGREE_CREDITS}</td>
                        <td className={`${table.td} text-xs text-slate-500`}>
                          <p>{s.student_contact || '—'}</p>
                          {s.guardian_contact && <p className="text-slate-400">Guardian {s.guardian_contact}</p>}
                        </td>
                        <td className={`${table.td} text-right`}>{due > 0 ? <Badge tone="rose">{taka(due)}</Badge> : <Badge tone="emerald">Cleared</Badge>}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
