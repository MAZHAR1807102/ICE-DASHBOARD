'use client';

import { useRef, useState } from 'react';
import { FileCheck2, FileUp } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Badge, Button, cx, inputClass, table } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { applyAnswerKey, cleanAnswers, correctedAnswers, gradeAnswers, optionLabel, parseAnswerKey, parseMcqText, type KeyChange, type McqAttempt, type McqExam, type McqQuestion } from '../../../../utils/mcq';

type Check = {
  questions: McqQuestion[];
  changes: KeyChange[];
  unmatched: number[];
  marks: { id: string; roll: string; name: string; from: number; to: number; total: number }[];
};

// After an exam: correct its answer key and re-mark everyone who has submitted.
// The HOD gives the same question set the exam was made from and its answer key; each question of the
// exam is matched to that set (by its printed number, or by its text for exams made before numbers
// were kept), so a key that was put on the wrong questions is corrected. Only the ticks change.
export default function FixAnswerKey({ exam, attempts, onClose, onDone }: {
  exam: McqExam;
  attempts: McqAttempt[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const numbered = exam.questions.every((q) => q.number !== undefined);
  const [setFile, setSetFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [pastedKey, setPastedKey] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState('');

  const submitted = attempts.filter((a) => a.submitted_at);

  const run = async () => {
    if (!numbered && !setFile) return toast.error('Choose the question set this exam was made from.');
    if (!keyFile && !pastedKey.trim()) return toast.error('Choose the answer key file, or paste the key.');
    setBusy('Reading the files…');
    try {
      const { readQuestionFile } = await import('../../../../utils/mcq-file');
      const key = parseAnswerKey(keyFile ? await readQuestionFile(keyFile) : pastedKey);
      if (!key.size) throw new Error('No answers were found in the key. Each answer should look like "1. b" or "1,b".');
      // The key on a fresh reading of the question set — or, when the exam kept its printed numbers, on its own questions.
      const base = numbered ? exam.questions.map((q) => ({ ...q, answer: null })) : parseMcqText(await readQuestionFile(setFile!)).questions;
      const result = correctedAnswers(exam.questions, applyAnswerKey(base, key).questions);
      if (result.unmatched.length > exam.questions.length / 5) {
        throw new Error(`${result.unmatched.length} of the ${exam.questions.length} questions could not be found in these files — are they the files this exam was made from?`);
      }
      const marks = submitted.map((a) => {
        const picks = cleanAnswers(a.answers, exam.questions);
        const before = a.score ?? gradeAnswers(exam.questions, picks).score;
        const after = gradeAnswers(result.questions, picks);
        return { id: a.id, roll: a.roll, name: a.name, from: before, to: after.score, total: after.total };
      }).sort((x, y) => y.to - x.to || x.roll.localeCompare(y.roll));
      setCheck({ ...result, marks });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the files.');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!check) return;
    const changed = check.marks.filter((m) => m.from !== m.to);
    if (!(await confirm({
      title: 'Save the corrected key and re-mark?',
      body: `${check.changes.length} correct answer${check.changes.length === 1 ? '' : 's'} change. ${changed.length} of ${check.marks.length} submitted result${check.marks.length === 1 ? '' : 's'} change; students see their new score and review at once.`,
      confirmLabel: 'Save and re-mark',
    }))) return;
    setBusy('Saving…');
    const { error } = await supabase.from('mcq_exams').update({ questions: check.questions }).eq('id', exam.id);
    if (error) {
      setBusy('');
      return toast.error(`Could not save the key: ${error.message}`);
    }
    let failed = 0;
    for (const m of check.marks) {
      const { error: e } = await supabase.from('mcq_attempts').update({ score: m.to, total: m.total }).eq('id', m.id).eq('exam_id', exam.id);
      if (e) failed++;
      setBusy(`Re-marking ${check.marks.indexOf(m) + 1}/${check.marks.length}…`);
    }
    setBusy('');
    if (failed) toast.error(`The key is saved, but ${failed} result${failed === 1 ? '' : 's'} could not be updated. Run "Fix answer key" again to finish.`);
    else toast.success(`Key corrected and ${check.marks.length} result${check.marks.length === 1 ? '' : 's'} re-marked.`);
    onDone();
  };

  return (
    <Modal title="Fix the answer key and re-mark" description={`${exam.title} · ${exam.questions.length} questions · ${submitted.length} submitted`} size="xl" onClose={onClose}>
      <div className="space-y-5">
        {!check ? (
          <>
            <p className="text-sm text-slate-600">
              Give the files this exam was made from. Each question is matched to its printed number, the correct answers are taken
              from the key, and everyone who submitted is marked again. Questions, options and pictures stay as they are.
            </p>
            {!numbered && <FilePick label="1. Question set" hint="The same PDF / Word file you uploaded when you made this exam." accept=".pdf,.docx,.txt" file={setFile} onPick={(f) => { setSetFile(f); setCheck(null); }} />}
            <FilePick label={`${numbered ? '1' : '2'}. Answer key`} hint="PDF, Word, text or CSV (e.g. the _Key.csv file) — or paste it below." accept=".pdf,.docx,.txt,.csv" file={keyFile} onPick={(f) => { setKeyFile(f); setCheck(null); }} />
            <textarea value={pastedKey} onChange={(e) => { setPastedKey(e.target.value); setCheck(null); }} rows={3} placeholder={'Or paste the key: 1. b  2. c  3. a …'} className={cx(inputClass, 'font-mono text-xs')} />
            <div className="flex justify-end">
              <Button icon={FileCheck2} loading={!!busy} onClick={run}>{busy || 'Check'}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone={check.changes.length ? 'amber' : 'emerald'} dot>{check.changes.length} correct answer{check.changes.length === 1 ? '' : 's'} change</Badge>
              <Badge tone="sky" dot>{check.marks.filter((m) => m.from !== m.to).length} of {check.marks.length} results change</Badge>
              {check.unmatched.length > 0 && <Badge tone="rose" dot>Kept as they are: question{check.unmatched.length === 1 ? '' : 's'} {check.unmatched.join(', ')}</Badge>}
            </div>
            {check.unmatched.length > 0 && (
              <p className="text-xs text-rose-700">These could not be matched to the files (or the key has no answer for them). Their answer is unchanged — check them in the exam’s questions.</p>
            )}
            {check.changes.length > 0 && (
              <details className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Answers that change</summary>
                <p className="mt-2 font-mono text-xs leading-6 text-slate-700">
                  {check.changes.map((c) => {
                    const q = exam.questions[c.index];
                    return <span key={c.index} className="mr-4 inline-block">Q{c.number}: {c.from === null ? '—' : optionLabel(q, c.from)} → {optionLabel(q, c.to)}</span>;
                  })}
                </p>
              </details>
            )}
            <div className={cx(table.wrap, 'max-h-80 overflow-y-auto')}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr><th className={table.th}>Roll</th><th className={table.th}>Name</th><th className={table.th}>Before</th><th className={table.th}>After</th></tr>
                </thead>
                <tbody className={table.body}>
                  {check.marks.map((m) => (
                    <tr key={m.id} className={table.row}>
                      <td className={cx(table.td, 'font-mono')}>{m.roll}</td>
                      <td className={table.td}>{m.name}</td>
                      <td className={cx(table.td, 'tabular-nums text-slate-500')}>{m.from}/{m.total}</td>
                      <td className={cx(table.td, 'tabular-nums font-semibold', m.to !== m.from && 'text-emerald-700')}>{m.to}/{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setCheck(null)} disabled={!!busy}>Back</Button>
              <Button loading={!!busy} disabled={!check.changes.length && check.marks.every((m) => m.from === m.to)} onClick={save}>{busy || 'Save and re-mark'}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function FilePick({ label, hint, accept, file, onPick }: { label: string; hint: string; accept: string; file: File | null; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mb-1.5 text-xs text-slate-500">{hint}</p>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <Button size="sm" variant="secondary" icon={FileUp} onClick={() => ref.current?.click()}>{file ? file.name : 'Choose file'}</Button>
    </div>
  );
}
