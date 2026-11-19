'use client';

import { useRef, useState } from 'react';
import { FileUp, FlaskConical, Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import CodeEditor from './CodeEditor';
import { Badge, Button, Field, cx, inputClass } from '../ui';
import { useToast } from '../Providers';
import { supabase } from '../../../utils/supabase';
import { LANGUAGES, LANGUAGE_IDS, allCases, type JudgeCase, type JudgeProblem, type LanguageId } from '../../../utils/judge';

const MAX_CASES_BYTES = 4 * 1024 * 1024;

// Pairs uploaded test files by name: 1.in + 1.out (or .ans / .txt), input1.txt + output1.txt.
async function pairFiles(files: File[]): Promise<{ cases: JudgeCase[]; unpaired: string[] }> {
  const key = (name: string) => name.toLowerCase().replace(/\.(in|out|ans|txt|a)$/g, '').replace(/^(input|output|in|out)[-_ ]?/, '').replace(/[-_ ]?(input|output|in|out)$/, '');
  const isOut = (name: string) => /\.(out|ans|a)$/i.test(name) || /(^|[-_ ])out(put)?/i.test(name);
  const groups = new Map<string, { input?: string; output?: string }>();
  for (const f of files) {
    const g = groups.get(key(f.name)) ?? {};
    if (isOut(f.name)) g.output = await f.text(); else g.input = await f.text();
    groups.set(key(f.name), g);
  }
  const cases: JudgeCase[] = [], unpaired: string[] = [];
  [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([k, g]) => {
    if (g.input !== undefined && g.output !== undefined) cases.push({ input: g.input, output: g.output });
    else unpaired.push(k);
  });
  return { cases, unpaired };
}

type Draft = Pick<JudgeProblem, 'title' | 'statement' | 'input_format' | 'output_format' | 'samples' | 'tests' | 'time_limit_ms' | 'memory_mb'>;

// Write or edit a problem: statement, samples (students see them), hidden test cases, limits —
// and try a model solution on all cases before using it.
export default function ProblemEditor({ problem, readOnly, authorName, onClose, onSaved }: {
  problem: JudgeProblem | null;
  readOnly: boolean;
  authorName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => problem ?? {
    title: '', statement: '', input_format: '', output_format: '', samples: [{ input: '', output: '' }], tests: [], time_limit_ms: 1000, memory_mb: 256,
  });
  const [saving, setSaving] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setCase = (list: 'samples' | 'tests', i: number, patch: Partial<JudgeCase>) => set({ [list]: d[list].map((c, k) => (k === i ? { ...c, ...patch } : c)) });

  const upload = async (files: FileList) => {
    const { cases, unpaired } = await pairFiles([...files]);
    if (!cases.length) return toast.error('No input/output pairs found. Name them like 1.in + 1.out, or input1.txt + output1.txt.');
    set({ tests: [...d.tests, ...cases] });
    toast.success(`Added ${cases.length} test case${cases.length === 1 ? '' : 's'}${unpaired.length ? ` — ${unpaired.length} file${unpaired.length === 1 ? '' : 's'} had no partner (${unpaired.slice(0, 3).join(', ')})` : ''}.`);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!d.title.trim()) return toast.error('Give the problem a title.');
    if (!d.statement.trim()) return toast.error('Write the problem statement.');
    const clean = (list: JudgeCase[]) => list.filter((c) => c.input.trim() || c.output.trim());
    const row = { ...d, title: d.title.trim(), samples: clean(d.samples), tests: clean(d.tests), updated_at: new Date().toISOString() };
    if (!allCases(row).length) return toast.error('Add at least one sample or test case.');
    if (JSON.stringify(row.tests).length + JSON.stringify(row.samples).length > MAX_CASES_BYTES) return toast.error('The test cases are too big (over 4 MB). Use fewer or smaller cases.');
    setSaving(true);
    const { error } = problem
      ? await supabase.from('judge_problems').update(row).eq('id', problem.id)
      : await supabase.from('judge_problems').insert({ ...row, author_name: authorName });
    setSaving(false);
    if (error) return toast.error(`Could not save: ${error.message}`);
    toast.success(problem ? 'Problem saved.' : 'Problem added to the bank.');
    onSaved();
  };

  const caseList = (list: 'samples' | 'tests') => (
    <div className="space-y-2">
      {d[list].map((c, i) => (
        <div key={i} className="grid items-start gap-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200 sm:grid-cols-[1fr_1fr_auto]">
          {(['input', 'output'] as const).map((side) => (
            <textarea key={side} value={c[side]} disabled={readOnly} onChange={(e) => setCase(list, i, { [side]: e.target.value })} rows={Math.min(6, Math.max(2, c[side].split('\n').length))}
              spellCheck={false} placeholder={side === 'input' ? 'Input' : 'Expected output'} aria-label={`${list === 'samples' ? 'Sample' : 'Test'} ${i + 1} ${side}`}
              className={cx(inputClass, 'font-mono text-xs')} />
          ))}
          {!readOnly && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set({ [list]: d[list].filter((_, k) => k !== i) })} aria-label={`Remove case ${i + 1}`} className="hover:bg-rose-50 hover:text-rose-600" />}
        </div>
      ))}
    </div>
  );

  return (
    <Modal title={readOnly ? d.title : problem ? 'Edit problem' : 'New problem'} description={readOnly ? `By ${problem?.author_name || 'another teacher'} — you can use it in your tests, not change it.` : 'Students see the statement and samples. Hidden test cases decide the marks.'} size="full" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Title" className="sm:col-span-4"><input value={d.title} disabled={readOnly} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Sum of two numbers" className={inputClass} /></Field>
          <Field label="Time limit (s)" className="sm:col-span-1">
            <input value={d.time_limit_ms / 1000} disabled={readOnly} type="number" min={0.1} max={10} step={0.1} onChange={(e) => set({ time_limit_ms: Math.round(Math.min(10, Math.max(0.1, Number(e.target.value) || 1)) * 1000) })} className={inputClass} />
          </Field>
          <Field label="Memory (MB)" className="sm:col-span-1">
            <input value={d.memory_mb} disabled={readOnly} type="number" min={16} max={1024} onChange={(e) => set({ memory_mb: Math.min(1024, Math.max(16, Number(e.target.value) || 256)) })} className={inputClass} />
          </Field>
          <Field label="Problem statement" className="sm:col-span-6">
            <textarea value={d.statement} disabled={readOnly} onChange={(e) => set({ statement: e.target.value })} rows={6} className={inputClass} placeholder="Describe the task. Plain text; line breaks are kept." />
          </Field>
          <Field label="Input format" className="sm:col-span-3"><textarea value={d.input_format} disabled={readOnly} onChange={(e) => set({ input_format: e.target.value })} rows={3} className={inputClass} placeholder="e.g. Two integers a and b (|a|, |b| ≤ 10⁹)." /></Field>
          <Field label="Output format" className="sm:col-span-3"><textarea value={d.output_format} disabled={readOnly} onChange={(e) => set({ output_format: e.target.value })} rows={3} className={inputClass} placeholder="e.g. Print a + b." /></Field>
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">Samples <span className="font-normal text-slate-500">— shown to students, also judged</span></p>
            {!readOnly && <Button size="sm" variant="secondary" icon={Plus} onClick={() => set({ samples: [...d.samples, { input: '', output: '' }] })}>Add sample</Button>}
          </div>
          {caseList('samples')}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">Hidden test cases <span className="font-normal text-slate-500">({d.tests.length}) — students never see these</span></p>
            {!readOnly && (
              <div className="flex gap-2">
                <input ref={fileRef} type="file" multiple accept=".in,.out,.ans,.txt" className="hidden" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
                <Button size="sm" variant="secondary" icon={FileUp} onClick={() => fileRef.current?.click()}>Upload files</Button>
                <Button size="sm" variant="secondary" icon={Plus} onClick={() => set({ tests: [...d.tests, { input: '', output: '' }] })}>Add case</Button>
              </div>
            )}
          </div>
          {!readOnly && <p className="text-xs text-slate-500">Upload many at once: name them 1.in + 1.out, 2.in + 2.out … (or input1.txt + output1.txt). Spaces at line ends and blank lines at the end don’t matter when comparing.</p>}
          {caseList('tests')}
        </section>

        <section className="rounded-xl ring-1 ring-slate-200">
          <button type="button" onClick={() => setCheckOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold text-slate-900">
            <FlaskConical className="size-4 text-indigo-600" aria-hidden /> Check with a model solution <span className="font-normal text-slate-500">— make sure the expected outputs are right</span>
          </button>
          {checkOpen && <ModelCheck cases={allCases(d)} limits={d} />}
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && <Button loading={saving} onClick={save}>{problem ? 'Save' : 'Add problem'}</Button>}
        </div>
      </div>
    </Modal>
  );
}

function ModelCheck({ cases, limits }: { cases: JudgeCase[]; limits: Pick<JudgeProblem, 'time_limit_ms' | 'memory_mb'> }) {
  const toast = useToast();
  const [language, setLanguage] = useState<LanguageId>('cpp');
  const [source, setSource] = useState(LANGUAGES.cpp.starter);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ verdict: string; label: string; time: number | null; output: string; error: string }[] | null>(null);

  const check = async () => {
    setBusy(true);
    setResults(null);
    const send = (body: unknown) => fetch('/api/judge/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));
    const started = await send({ language, source, cases, ...limits });
    if (!started.ok) { setBusy(false); return toast.error(started.body.error ?? 'Could not run it.'); }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const polled = await send({ tokens: started.body.tokens, cases });
      if (!polled.ok) { setBusy(false); return toast.error(polled.body.error ?? 'Could not get the results.'); }
      setResults(polled.body.results);
      if (polled.body.done) break;
    }
    setBusy(false);
  };

  const passed = results?.filter((r) => r.verdict === 'AC').length ?? 0;
  return (
    <div className="space-y-3 border-t border-slate-100 p-4">
      <div className="flex items-center gap-2">
        <select value={language} onChange={(e) => { const l = e.target.value as LanguageId; setLanguage(l); setSource(LANGUAGES[l].starter); }} className={cx(inputClass, 'w-auto')} aria-label="Language">
          {LANGUAGE_IDS.map((l) => <option key={l} value={l}>{LANGUAGES[l].label}</option>)}
        </select>
        <Button size="sm" loading={busy} onClick={check} disabled={!cases.length}>Run on all {cases.length} cases</Button>
        {results && <Badge tone={passed === cases.length ? 'emerald' : 'rose'}>{passed}/{cases.length} passed</Badge>}
      </div>
      <CodeEditor value={source} onChange={setSource} label="Model solution" className="h-64" />
      {results && (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {results.map((r, i) => (
            <li key={i} className={cx('rounded-lg px-3 py-2 text-xs ring-1 ring-inset', r.verdict === 'AC' ? 'bg-emerald-50 ring-emerald-200' : 'bg-rose-50 ring-rose-200')}>
              <b>Case {i + 1}:</b> {r.label}{r.time !== null ? ` · ${r.time} s` : ''}
              {r.verdict !== 'AC' && (r.error || r.output) && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-700">{r.error || `Printed: ${r.output}`}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
