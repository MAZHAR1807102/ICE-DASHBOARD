'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw, X } from 'lucide-react';
import Modal from '../Modal';
import { Button, Field, cx, inputClass } from '../ui';
import { useToast } from '../Providers';
import { supabase } from '../../../utils/supabase';
import { SEMESTERS } from '../../../utils/types';
import { semesterTitle } from '../../../utils/rollsheet';
import { KINDS, LANGUAGES, LANGUAGE_IDS, allCases, isTimedKind, newTestCode, newTestPassword, type JudgeProblem, type JudgeTest, type LanguageId, type TestKind } from '../../../utils/judge';

// datetime-local works in local time; the database keeps UTC.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// Create or edit a coding test: kind, who takes it, timing, languages, strict mode, problems + marks.
// Once anyone has started, the problems and marks are locked.
export default function TestEditor({ test, bank, locked, authorName, onClose, onSaved }: {
  test: JudgeTest | null;
  bank: JudgeProblem[];
  locked: boolean;
  authorName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(test?.title ?? '');
  const [kind, setKind] = useState<TestKind>(test?.kind ?? 'lab');
  const [semester, setSemester] = useState<number | null>(test?.semester ?? null);
  const [password, setPassword] = useState(test?.password ?? newTestPassword());
  const [duration, setDuration] = useState(test?.duration_minutes ? String(test.duration_minutes) : test ? '' : '60');
  const [endsAt, setEndsAt] = useState(toLocalInput(test?.ends_at ?? null));
  const [languages, setLanguages] = useState<LanguageId[]>(test?.languages ?? [...LANGUAGE_IDS]);
  const [strict, setStrict] = useState(test?.strict ?? true);
  const [problems, setProblems] = useState(test?.problems ?? []);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const scored = kind !== 'practice' && kind !== 'contest';

  const titleOf = (id: string) => bank.find((p) => p.id === id)?.title ?? '(deleted problem)';
  const move = (i: number, by: number) => setProblems((list) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });
  const available = bank.filter((p) => !problems.some((x) => x.id === p.id) && p.title.toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    const minutes = duration.trim() ? Number(duration) : null;
    if (!title.trim()) return toast.error('Give the test a title.');
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) return toast.error('Time must be 1 to 1440 minutes (or empty for no timer).');
    if (!/^[A-Za-z0-9]{4,40}$/.test(password)) return toast.error('Password: 4 to 40 letters or digits.');
    if (!languages.length) return toast.error('Allow at least one language.');
    if (kind === 'assignment' && !endsAt) return toast.error('An assignment needs a deadline.');
    setSaving(true);
    const row = {
      title: title.trim(), kind, semester, password, languages, strict,
      duration_minutes: minutes, ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      ...(locked ? {} : { problems }),
    };
    const { error } = test
      ? await supabase.from('judge_tests').update(row).eq('id', test.id)
      : await supabase.from('judge_tests').insert({ ...row, code: newTestCode(), author_name: authorName });
    setSaving(false);
    if (error) return toast.error(`Could not save: ${error.message}`);
    toast.success(test ? 'Test saved.' : 'Test created. Open it when you are ready.');
    onSaved();
  };

  return (
    <Modal title={test ? 'Edit coding test' : 'New coding test'} description="Settings, rules and problems." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Title" className="sm:col-span-4"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CSE2112 Lab Test 1" className={inputClass} /></Field>
          <Field label="Kind" hint={KINDS[kind].hint} className="sm:col-span-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as TestKind)} disabled={locked} className={inputClass}>
              {(Object.keys(KINDS) as TestKind[]).map((k) => <option key={k} value={k}>{KINDS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Who takes it" hint="Students of this semester see it in their portal. Anyone else needs the link + password." className="sm:col-span-3">
            <select value={semester ?? ''} onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
              <option value="">Link + password only</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n} · {semesterTitle(n)}</option>)}
            </select>
          </Field>
          <Field label="Password" className="sm:col-span-3">
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))} className={cx(inputClass, 'font-mono')} />
              <Button variant="secondary" icon={RefreshCw} onClick={() => setPassword(newTestPassword())} aria-label="New password" />
            </div>
          </Field>
          <Field label="Timer (minutes)" hint={isTimedKind(kind) ? 'Each student’s time starts when they press Start.' : 'Usually empty for assignments and practice.'} className="sm:col-span-3">
            <input value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="No timer" className={inputClass} />
          </Field>
          <Field label="Deadline (optional)" hint="Nobody can submit after this." className="sm:col-span-3">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </Field>
          <div className="sm:col-span-6">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Languages</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_IDS.map((l) => (
                <label key={l} className={cx('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset', languages.includes(l) ? 'bg-indigo-50 ring-indigo-300' : 'ring-slate-200')}>
                  <input type="checkbox" checked={languages.includes(l)} onChange={(e) => setLanguages((list) => (e.target.checked ? LANGUAGE_IDS.filter((x) => x === l || list.includes(x)) : list.filter((x) => x !== l)))} className="accent-indigo-600" />
                  {LANGUAGES[l].label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200 sm:col-span-6">
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="mt-0.5 size-4 accent-rose-600" />
            <span className="text-sm">
              <span className="font-semibold text-rose-900">Strict mode</span>
              <span className="block text-xs text-rose-800">No copy/paste in the code editor. Leaving the test page (another tab, app or window) once gives a warning; the second time the student is logged out and blocked until the HOD unblocks them.</span>
            </span>
          </label>
        </div>

        <section className="rounded-xl ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-900">Problems <span className="font-normal text-slate-500">({problems.length})</span></p>
            <p className="text-xs text-slate-500">{locked ? 'Locked — students have already started this test.' : `Pick problems from the problem bank${scored ? ' and set the marks for each' : ''}. Students see them in this order (A, B, C…).`}</p>
          </div>
          {problems.length > 0 && (
            <ol className="divide-y divide-slate-100">
              {problems.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="w-6 text-sm font-bold text-slate-500">{String.fromCharCode(65 + i)}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{titleOf(p.id)}</span>
                  {scored && (
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      Marks
                      <input value={p.points} disabled={locked} inputMode="numeric" onChange={(e) => setProblems((list) => list.map((x, k) => (k === i ? { ...x, points: Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 0) } : x)))} className={cx(inputClass, 'w-16 py-1 text-center')} aria-label={`Marks for ${titleOf(p.id)}`} />
                    </label>
                  )}
                  {!locked && (
                    <>
                      <Button size="xs" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
                      <Button size="xs" variant="ghost" icon={ArrowDown} disabled={i === problems.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
                      <Button size="xs" variant="ghost" icon={X} onClick={() => setProblems((list) => list.filter((_, k) => k !== i))} aria-label="Remove" className="hover:bg-rose-50 hover:text-rose-600" />
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!locked && (
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the problem bank…" className={inputClass} />
              {bank.length === 0 ? <p className="text-xs text-slate-500">The problem bank is empty — add problems in the “Problem bank” tab first.</p> : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {available.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setProblems((list) => [...list, { id: p.id, points: 10 }])} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-left text-sm ring-1 ring-slate-200 hover:ring-indigo-300">
                        <span className="truncate">+ {p.title}</span>
                        <span className="shrink-0 text-xs text-slate-500">{allCases(p).length} cases · {p.author_name || '—'}</span>
                      </button>
                    </li>
                  ))}
                  {!available.length && <li className="text-xs text-slate-500">No other problems match.</li>}
                </ul>
              )}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>{test ? 'Save' : 'Create test'}</Button>
        </div>
      </div>
    </Modal>
  );
}
