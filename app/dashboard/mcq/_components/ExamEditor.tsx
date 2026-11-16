'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, FileCheck2, FileUp, ImageOff, Plus, RefreshCw, Trash2, Type } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, Field, cx, inputClass } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { SEMESTERS } from '../../../../utils/types';
import { semesterTitle } from '../../../../utils/rollsheet';
import { MAX_OPTIONS, applyAnswerKey, optionLabel, newExamCode, newExamPassword, parseAnswerKey, parseMcqText, questionProblems, type McqExam, type McqImage, type McqQuestion } from '../../../../utils/mcq';

// A picture not uploaded yet is held in the browser (a blob: URL); a saved one is in storage.
const pictureSrc = (image: McqImage) => (image.path.startsWith('blob:') ? image.path : `/api/mcq/image?path=${encodeURIComponent(image.path)}`);

// Create or edit an MCQ exam: settings, read the question set from a file (or pasted text),
// then check every question and tick its correct option. Once anyone has started the exam the
// questions are locked (changing them would change what people are being graded against).
export default function ExamEditor({ exam, locked, onClose, onSaved }: {
  exam: McqExam | null;
  locked: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState(exam?.title ?? '');
  const [semester, setSemester] = useState<number | null>(exam?.semester ?? null);
  const [duration, setDuration] = useState(String(exam?.duration_minutes ?? 20));
  const [password, setPassword] = useState(exam?.password ?? newExamPassword());
  const [questions, setQuestions] = useState<McqQuestion[]>(exam?.questions ?? []);
  const [shuffle, setShuffle] = useState(exam?.shuffle ?? true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pastedKey, setPastedKey] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  // The exam's link code, also the storage folder of its pictures (so a new exam needs it up front).
  const [code] = useState(() => exam?.code ?? newExamCode());
  const fileRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const problems = questionProblems(questions);
  const setQuestion = (i: number, patch: Partial<McqQuestion>) => setQuestions((list) => list.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  // Returns the printed question numbers when the questions were put in the editor.
  const applyParsed = async (lines: string[] | string) => {
    const result = parseMcqText(lines);
    if (!result.questions.length) {
      setWarnings(result.warnings);
      toast.error(result.warnings[0] ?? 'No questions were found.');
      return null;
    }
    if (questions.length && !(await confirm({ title: 'Replace the questions?', body: `The ${questions.length} questions in the editor will be replaced by the ${result.questions.length} just read.`, confirmLabel: 'Replace' }))) return null;
    setQuestions(result.questions);
    setWarnings(result.warnings);
    const missing = result.questions.filter((q) => q.answer === null).length;
    toast.success(`Read ${result.questions.length} questions${missing ? ` — ${missing} still need their answer ticked` : ', all with answers'}. Check them below.`);
    return result.numbers;
  };

  const readFile = async (file: File) => {
    setReading(true);
    try {
      const { readQuestionSet, questionPictures } = await import('../../../../utils/mcq-file');
      const set = await readQuestionSet(file);
      const numbers = await applyParsed(set.lines);
      // From a PDF, each question is also cut out as a picture: students see it exactly as printed.
      if (numbers && set.pdf) {
        const pictures = await questionPictures(set.pdf, numbers, (done) => setProgress(`Making pictures ${done}/${numbers.length}`));
        setQuestions((list) => list.map((q, i) => {
          const pic = pictures.get(numbers[i]);
          return pic ? { ...q, image: { path: URL.createObjectURL(pic.blob), width: pic.width, height: pic.height } } : q;
        }));
        if (pictures.size < numbers.length) toast.info(`${numbers.length - pictures.size} question${numbers.length - pictures.size === 1 ? '' : 's'} could not be cut out as a picture and will be shown as text — check ${numbers.length - pictures.size === 1 ? 'it' : 'them'}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the file.');
    } finally {
      setReading(false);
      setProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Uploads the pictures still held in the browser; returns the questions with their storage paths.
  const uploadPictures = async (list: McqQuestion[]) => {
    const pending = list.flatMap((q, i) => (q.image?.path.startsWith('blob:') ? [i] : []));
    const total = pending.length;
    const out = [...list];
    let done = 0, failed = 0;
    const worker = async () => {
      for (let i = pending.shift(); i !== undefined; i = pending.shift()) {
        const image = out[i].image!;
        try {
          const blob = await (await fetch(image.path)).blob();
          const res = await fetch(`/api/mcq/image?folder=${code}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error);
          out[i] = { ...out[i], image: { ...image, path: body.path } };
        } catch { failed++; }
        setProgress(`Saving pictures ${++done}/${total}`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    setQuestions(out); // keep what was uploaded, so trying again sends only the rest
    return failed ? null : out;
  };

  // Answers from a separate file: ticks each question's option, then says what didn't match.
  const applyKey = (lines: string[] | string) => {
    const result = applyAnswerKey(questions, parseAnswerKey(lines));
    if (!result.matched) return toast.error('No answers were found in that file. Each answer should look like "1. b", "1-b", or a row of numbers with a row of letters under it.');
    setQuestions(result.questions);
    const notes = [
      ...result.missing.map((n) => `Question ${n}: not in the answer key — tick it.`),
      ...result.unclear.map((n) => `Question ${n}: the answer in the key doesn't match any option — tick it.`),
      ...(result.extra ? [`The key has ${result.extra} answer${result.extra === 1 ? '' : 's'} for question numbers that aren't here — check both files are for the same set.`] : []),
    ];
    setWarnings(notes);
    if (notes.length) toast.info(`Ticked ${result.matched} of ${questions.length} answers. Check the highlighted questions.`);
    else toast.success(`Ticked all ${result.matched} answers from the key.`);
  };

  const readKeyFile = async (file: File) => {
    setReading(true);
    try {
      const { readQuestionFile } = await import('../../../../utils/mcq-file');
      applyKey(await readQuestionFile(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the file.');
    } finally {
      setReading(false);
      if (keyRef.current) keyRef.current.value = '';
    }
  };

  const save = async () => {
    const minutes = Number(duration);
    if (!title.trim()) return toast.error('Give the exam a title.');
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) return toast.error('Time must be 1 to 300 minutes.');
    if (!/^[A-Za-z0-9]{4,40}$/.test(password)) return toast.error('Password: 4 to 40 letters or digits.');
    setSaving(true);
    const uploaded = locked ? questions : await uploadPictures(questions);
    setProgress('');
    if (!uploaded) {
      setSaving(false);
      return toast.error('Some pictures could not be saved. Check your internet connection and press Save again.');
    }
    const cleaned = uploaded.map((q) => ({
      text: q.text.trim(), options: q.options.map((o) => o.trim()), answer: q.answer,
      ...(q.image ? { image: q.image } : {}), ...(q.labels ? { labels: q.labels } : {}),
    }));
    const row = { title: title.trim(), semester, duration_minutes: minutes, password, ...(locked ? {} : { questions: cleaned, shuffle }) };
    const { error } = exam
      ? await supabase.from('mcq_exams').update(row).eq('id', exam.id)
      : await supabase.from('mcq_exams').insert({ ...row, code });
    setSaving(false);
    if (error) return toast.error(`Could not save: ${error.message}`);
    // Pictures of questions that were replaced or deleted are removed from storage.
    const kept = new Set(cleaned.flatMap((q) => q.image?.path ?? []));
    const unused = (exam?.questions ?? []).flatMap((q) => (q.image && !kept.has(q.image.path) ? [q.image.path] : []));
    if (!locked && unused.length) fetch('/api/mcq/image', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: unused }) }).catch(() => {});
    toast.success(exam ? 'Exam saved.' : 'Exam created. Open it when you are ready.');
    onSaved();
  };

  return (
    <Modal title={exam ? 'Edit MCQ exam' : 'New MCQ exam'} description="Settings, the question set, and the correct answers." size="xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Title" className="sm:col-span-6">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Data Structure — Class Test 2" className={inputClass} />
          </Field>
          <Field label="Who takes it" hint="Students of this semester see it in their portal. Anyone else needs the link + password." className="sm:col-span-3">
            <select value={semester ?? ''} onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
              <option value="">Link + password only</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n} · {semesterTitle(n)}</option>)}
            </select>
          </Field>
          <Field label="Time (minutes)" className="sm:col-span-1">
            <input value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} />
          </Field>
          <Field label="Password" className="sm:col-span-2">
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))} className={cx(inputClass, 'font-mono')} />
              <Button variant="secondary" icon={RefreshCw} onClick={() => setPassword(newExamPassword())} aria-label="New password" />
            </div>
          </Field>
          <label className={cx('flex items-start gap-2.5 sm:col-span-6', locked && 'opacity-60')}>
            <input type="checkbox" checked={shuffle} disabled={locked} onChange={(e) => setShuffle(e.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
            <span className="text-sm">
              <span className="font-medium text-slate-700">Shuffle questions</span>
              <span className="block text-xs text-slate-500">Each student gets the questions in a different order, so neighbours can’t follow each other’s numbers. Results and the answer key are not affected.</span>
            </span>
          </label>
        </div>

        <section className="rounded-xl ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">Questions <span className="font-normal text-slate-500">({questions.length})</span></p>
              <p className="text-xs text-slate-500">
                {locked ? 'Locked — people have already started this exam.' : 'Upload the question set (PDF, Word or text). From a PDF, students see each question as a picture of the page, so equations, tables and figures look exactly as printed. Answers in the same file ("Ans: b", a starred option, a key at the end) are ticked automatically; if they are in a separate file, upload it with "Upload answer key".'}
              </p>
            </div>
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
                <Button size="sm" icon={FileUp} loading={reading} onClick={() => fileRef.current?.click()}>{reading && progress ? progress : 'Upload question set'}</Button>
                <input ref={keyRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && readKeyFile(e.target.files[0])} />
                <Button size="sm" variant="secondary" icon={FileCheck2} disabled={!questions.length || reading} onClick={() => keyRef.current?.click()} title={questions.length ? undefined : 'Upload the questions first'}>Upload answer key</Button>
                <Button size="sm" variant="secondary" icon={Type} onClick={() => setPasteOpen((v) => !v)}>Paste text</Button>
              </div>
            )}
          </div>

          {pasteOpen && !locked && (
            <div className="space-y-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'1. Which data structure uses LIFO?\na) Queue\nb) Stack\nc) Tree\nd) Graph\nAns: b'} className={cx(inputClass, 'font-mono text-xs')} />
              <Button size="sm" disabled={!pasted.trim()} onClick={() => applyParsed(pasted)}>Read pasted questions</Button>
              {questions.length > 0 && (
                <>
                  <textarea rows={3} value={pastedKey} onChange={(e) => setPastedKey(e.target.value)} placeholder={'Answer key — e.g.\n1. b   2. c   3. a\nor 1-b, 2-c, 3-a'} className={cx(inputClass, 'font-mono text-xs')} />
                  <Button size="sm" variant="secondary" disabled={!pastedKey.trim()} onClick={() => applyKey(pastedKey)}>Apply pasted answer key</Button>
                </>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" /> Check these:</p>
              <ul className="mt-1 list-disc pl-5">{warnings.slice(0, 8).map((w) => <li key={w}>{w}</li>)}</ul>
              {warnings.length > 8 && <p className="mt-1">…and {warnings.length - 8} more.</p>}
            </div>
          )}

          {questions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No questions yet — upload the question set or paste it.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {questions.map((q, i) => (
                <li key={i} className={cx('space-y-2 px-4 py-3', q.answer === null && 'bg-amber-50/40')}>
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-7 shrink-0 text-sm font-semibold text-slate-500">{i + 1}.</span>
                    {q.image ? (
                      <div className="min-w-0 flex-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local or private, HOD-only picture */}
                        <img src={pictureSrc(q.image)} alt={`Question ${i + 1}`} width={q.image.width} height={q.image.height} className="h-auto max-w-full rounded ring-1 ring-slate-200" />
                        {!locked && (
                          <button type="button" onClick={() => setQuestion(i, { image: undefined })} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
                            <ImageOff className="size-3.5" /> Show as text instead
                          </button>
                        )}
                      </div>
                    ) : (
                      <textarea rows={Math.min(4, Math.ceil(q.text.length / 90) || 1)} value={q.text} disabled={locked} onChange={(e) => setQuestion(i, { text: e.target.value })} className={cx(inputClass, 'text-sm')} aria-label={`Question ${i + 1}`} />
                    )}
                    {!locked && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setQuestions((list) => list.filter((_, k) => k !== i))} aria-label={`Delete question ${i + 1}`} className="mt-1 hover:bg-rose-50 hover:text-rose-600" />}
                  </div>
                  <div className="grid gap-1.5 pl-9 sm:grid-cols-2" role="radiogroup" aria-label={`Correct answer for question ${i + 1}`}>
                    {q.options.map((opt, k) => (
                      <label key={k} className={cx('flex items-center gap-2 rounded-lg px-2 py-1 ring-1 ring-inset', q.answer === k ? 'bg-emerald-50 ring-emerald-300' : 'ring-slate-200')}>
                        <input type="radio" name={`answer-${i}`} checked={q.answer === k} disabled={locked} onChange={() => setQuestion(i, { answer: k })} className="accent-emerald-600" title="Correct answer" />
                        <span className="w-4 text-xs font-bold text-slate-500">{optionLabel(q, k)}</span>
                        <input value={opt} disabled={locked} onChange={(e) => setQuestion(i, { options: q.options.map((o, j) => (j === k ? e.target.value : o)) })} className={cx('min-w-0 flex-1 bg-transparent text-sm outline-none', q.image && 'text-slate-400')} aria-label={`Question ${i + 1} option ${optionLabel(q, k)}`} title={q.image ? 'Students see the picture; this text is only for you' : undefined} />
                        {!locked && q.options.length > 2 && (
                          <button type="button" onClick={() => setQuestion(i, { options: q.options.filter((_, j) => j !== k), answer: q.answer === k ? null : q.answer !== null && q.answer > k ? q.answer - 1 : q.answer })} className="text-slate-400 hover:text-rose-600" aria-label={`Remove option ${optionLabel(q, k)}`}>×</button>
                        )}
                      </label>
                    ))}
                    {!locked && q.options.length < MAX_OPTIONS && (
                      <button type="button" onClick={() => setQuestion(i, { options: [...q.options, ''] })} className="rounded-lg px-2 py-1 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50">+ Add option</button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!locked && (
            <div className="border-t border-slate-100 px-4 py-2">
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setQuestions((list) => [...list, { text: '', options: ['', '', '', ''], answer: null }])}>Add a question</Button>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={cx('text-xs', problems.length ? 'text-amber-700' : 'text-emerald-700')}>
            {problems.length ? `${problems.length} thing${problems.length === 1 ? '' : 's'} to fix before the exam can open — e.g. ${problems[0]}` : `Ready: ${questions.length} questions, every one with its answer.`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={saving} disabled={reading} onClick={save}>{saving && progress ? progress : exam ? 'Save' : 'Create exam'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
