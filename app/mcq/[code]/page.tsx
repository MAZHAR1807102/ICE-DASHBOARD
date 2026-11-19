'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, KeyRound, ListChecks, Send, XCircle } from 'lucide-react';
import Brand from '../../components/Brand';
import { Button, Card, Field, cx, inputClass } from '../../components/ui';
import { useConfirm, useToast } from '../../components/Providers';
import { BlockedNotice, LeaveWarning, StrictRules } from '../../components/LeaveWarning';
import { supabase } from '../../../utils/supabase';
import { reportLeave, useLeaveGuard } from '../../../utils/useLeaveGuard';
import { optionLabel, type AttemptView, type FinishedAttempt, type RunningAttempt, type ShownQuestion } from '../../../utils/mcq';

type Info = {
  title: string; semester: number | null; duration: number; count: number; status: 'open' | 'closed'; strict: boolean;
  me: { name: string; roll: string; ownSemester: boolean; token: string | null; submitted: boolean; blocked: boolean } | null;
};

// The token for this exam on this device, so a reload (or a dropped connection) resumes the attempt.
const tokenKey = (code: string) => `mcq.${code}`;
const readToken = (code: string) => { try { return localStorage.getItem(tokenKey(code)); } catch { return null; } };
const saveToken = (code: string, token: string) => { try { localStorage.setItem(tokenKey(code), token); } catch { /* private mode */ } };
const forgetToken = (code: string) => { try { localStorage.removeItem(tokenKey(code)); } catch { /* private mode */ } };

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));

// Public page (no proxy rule): /mcq/<code>. Students of the exam's semester who are signed in join
// as themselves; anyone else enters the password, their name and roll.
export default function McqExamPage() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<AttemptView | null>(null);

  useEffect(() => {
    fetch(`/api/mcq/info?code=${encodeURIComponent(code)}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error ?? 'Could not load this exam.');
      setInfo(body as Info);
      if ((body as Info).me?.blocked) return setView({ state: 'blocked', title: (body as Info).title });
      const saved = (body as Info).me?.token ?? readToken(code);
      if (!saved) return;
      const attempt = await fetch(`/api/mcq/attempt?token=${encodeURIComponent(saved)}`);
      if (attempt.ok) {
        setToken(saved);
        setView(await attempt.json());
      }
    }).catch(() => setError('Could not load this exam. Check your internet connection.'));
  }, [code]);

  // Strict mode, second time: logged out of the portal and off this exam until the HOD unblocks them.
  const blockedOut = useCallback(() => {
    forgetToken(code);
    setToken(null);
    setView({ state: 'blocked', title: info?.title ?? '' });
    supabase.auth.signOut().catch(() => {});
  }, [code, info?.title]);

  const started = (t: string, v: AttemptView) => {
    saveToken(code, t);
    setToken(t);
    setView(v);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4"><Brand subtitle="MCQ exam" href="/" /></div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {error ? (
          <Card className="p-8 text-center"><p className="font-semibold text-slate-900">{error}</p></Card>
        ) : !info ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading…</p>
        ) : view?.state === 'blocked' ? (
          <BlockedNotice what="exam" />
        ) : view?.state === 'running' && token ? (
          <Runner code={code} token={token} initial={view} onDone={setView} onBlocked={blockedOut} />
        ) : view?.state === 'done' ? (
          <Result result={view} token={token} />
        ) : (
          <Join code={code} info={info} onStarted={started} onBlocked={blockedOut} />
        )}
      </main>
    </div>
  );
}

function Join({ code, info, onStarted, onBlocked }: { code: string; info: Info; onStarted: (token: string, view: AttemptView) => void; onBlocked: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const needsPassword = !info.me?.ownSemester;

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { ok, body } = await post('/api/mcq/join', { code, name, roll, password, token: readToken(code) })
      .catch(() => ({ ok: false, body: { error: 'Could not reach the server. Check your internet connection.' } }));
    setBusy(false);
    if (!ok) {
      if (/blocked/i.test(body.error ?? '')) return onBlocked();
      return toast.error(body.error ?? 'Could not start the exam.');
    }
    if (body.view?.state === 'blocked') return onBlocked();
    onStarted(body.token, body.view);
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-700 to-violet-600 px-6 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">MCQ exam</p>
        <h1 className="mt-1 text-2xl font-bold">{info.title}</h1>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-indigo-100">
          <span className="flex items-center gap-1.5"><ListChecks className="size-4" />{info.count} questions</span>
          <span className="flex items-center gap-1.5"><Clock className="size-4" />{info.duration} minutes</span>
        </div>
      </div>
      {info.status !== 'open' ? (
        <p className="p-6 text-center font-semibold text-slate-700">This exam is closed.</p>
      ) : (
        <form onSubmit={start} className="space-y-4 p-6">
          {info.strict && <StrictRules what="exam" closingCounts />}
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>The timer starts when you press <b>Start exam</b> and keeps running even if you close the page.</li>
            <li>Your answers are saved as you pick them. When time is up, the exam is submitted automatically.</li>
            <li>You can take this exam only once.</li>
          </ul>
          {info.me ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Signed in as <b>{info.me.name}</b> ({info.me.roll})</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name"><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputClass} /></Field>
              <Field label="Roll" hint="Your RU ID or college roll."><input required value={roll} onChange={(e) => setRoll(e.target.value.replace(/\s/g, ''))} inputMode="numeric" className={cx(inputClass, 'font-mono')} /></Field>
            </div>
          )}
          {needsPassword && (
            <Field label="Exam password"><input required value={password} onChange={(e) => setPassword(e.target.value.trim())} autoCapitalize="characters" className={cx(inputClass, 'font-mono uppercase')} /></Field>
          )}
          {info.strict && (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
              <span>I have read the rules. I understand that leaving the page twice blocks me from this exam.</span>
            </label>
          )}
          <Button type="submit" size="lg" icon={needsPassword ? KeyRound : undefined} loading={busy} disabled={info.strict && !agreed} className="w-full">Start exam</Button>
        </form>
      )}
    </Card>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Runner({ code, token, initial, onDone, onBlocked }: { code: string; token: string; initial: RunningAttempt; onDone: (v: AttemptView) => void; onBlocked: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [answers, setAnswers] = useState(initial.answers);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  // Server time minus device time: the countdown follows the server's deadline, not the phone's clock.
  const [offset] = useState(() => new Date(initial.now).getTime() - Date.now());
  const deadline = new Date(initial.deadline).getTime();
  const latest = useRef(answers);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);
  const [warning, setWarning] = useState(false);
  const [warned, setWarned] = useState(initial.warnings > 0);

  // Strict mode: leaving the exam page once = warning, twice = blocked. Closing it counts too.
  useLeaveGuard({
    active: initial.strict,
    paused: () => finishing.current,
    closingCounts: true,
    report: (kind) => reportLeave('/api/mcq/violation', token, kind),
    onWarning: () => { setWarned(true); setWarning(true); },
    onBlocked: () => { finishing.current = true; onBlocked(); },
  });

  const submit = useCallback(async (auto: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    setSubmitting(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      const res = await post('/api/mcq/attempt', { token, answers: latest.current, submit: true, auto }).catch(() => null);
      if (res?.ok && res.body.state === 'done') return onDone(res.body);
      if (res?.ok && res.body.state === 'blocked') return onBlocked();
      await new Promise((r) => setTimeout(r, 1500));
    }
    finishing.current = false;
    setSubmitting(false);
    toast.error('Could not submit — check your internet connection and press Submit again.');
  }, [token, onDone, onBlocked, toast]);

  // Tick every second; at zero, submit automatically.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t + offset >= deadline) submit(true);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, offset, submit]);

  const pick = (q: number, option: number) => {
    const next = answers.map((a, i) => (i === q ? option : a));
    setAnswers(next);
    latest.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { post('/api/mcq/attempt', { token, answers: latest.current }).catch(() => {}); }, 700);
  };

  const left = deadline - (now + offset);
  const answered = answers.filter((a) => a !== null).length;

  const askSubmit = async () => {
    const blank = answers.length - answered;
    if (await confirm({ title: 'Submit your answers?', body: blank ? `${blank} question${blank === 1 ? ' is' : 's are'} not answered. You cannot change anything after submitting.` : 'You cannot change anything after submitting.', confirmLabel: 'Submit' })) submit(false);
  };

  return (
    <div className={cx(initial.strict && 'select-none')} onCopy={(e) => { if (initial.strict) e.preventDefault(); }} onContextMenu={(e) => { if (initial.strict) e.preventDefault(); }}>
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{initial.title}</p>
            <p className="text-xs text-slate-500">{initial.name} · {initial.roll} · answered {answered}/{answers.length}
              {initial.strict && (warned ? <span className="ml-2 font-semibold text-rose-600">⚠ Warning given — leaving again blocks you</span> : <span className="ml-2">· stay on this page</span>)}
            </p>
          </div>
          <div className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums', left < 60_000 ? 'bg-rose-100 text-rose-700' : left < 300_000 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800')} role="timer" aria-label="Time left">
            <Clock className="size-4" aria-hidden />{clock(left)}
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        {initial.questions.map((q, i) => (
          <li key={i}>
            <Card className="p-4">
              <QuestionView q={q} n={i + 1} src={`/api/mcq/image?token=${encodeURIComponent(token)}&q=${i}`}>
                {(asPicture) => (
                  <div className={asPicture ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'space-y-2'}>
                    {q.options.map((opt, k) => (
                      <label key={k} className={cx('flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset transition-colors', answers[i] === k ? 'bg-indigo-50 ring-indigo-400' : 'ring-slate-200 hover:bg-slate-50')}>
                        <input type="radio" name={`q${i}`} checked={answers[i] === k} onChange={() => pick(i, k)} disabled={submitting} className="mt-1 accent-indigo-600" aria-label={asPicture ? `Option ${optionLabel(q, k)}` : undefined} />
                        <span className="text-sm"><b className={cx('text-slate-500', asPicture ? 'text-base' : 'mr-1.5')}>({optionLabel(q, k)})</b>{!asPicture && opt}</span>
                      </label>
                    ))}
                  </div>
                )}
              </QuestionView>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-col items-center gap-2 pb-10">
        <Button size="lg" icon={Send} loading={submitting} onClick={askSubmit} className="w-full sm:w-auto">Submit answers</Button>
        <p className="text-xs text-slate-500">Saved automatically · submitted for you when the timer reaches 0:00 · exam code {code}</p>
      </div>
      {warning && <LeaveWarning what="exam" onClose={() => setWarning(false)} />}
    </div>
  );
}

// A question: its picture from the PDF (exactly as printed — equations, tables, figures) or, for a
// question typed in / read from Word, its text. If the picture can't load, the text is shown instead.
function QuestionView({ q, n, src, children }: { q: ShownQuestion; n: number; src: string; children: (asPicture: boolean) => React.ReactNode }) {
  const [broken, setBroken] = useState(false);
  const asPicture = Boolean(q.picture) && !broken;
  return (
    <fieldset>
      <legend className="mb-3 flex w-full gap-2 font-medium text-slate-900">
        <span className="text-slate-400">{n}.</span>
        {asPicture ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, token-checked picture
          <img src={src} alt={q.text} width={q.picture!.width} height={q.picture!.height} onError={() => setBroken(true)} className="h-auto max-w-full min-w-0 select-none" draggable={false} />
        ) : <span className="whitespace-pre-line">{q.text}</span>}
      </legend>
      {children(asPicture)}
    </fieldset>
  );
}

function Result({ result, token }: { result: FinishedAttempt; token: string | null }) {
  const [showAll, setShowAll] = useState(false);
  const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
  const wrong = result.review.filter((q) => q.picked !== q.answer).length;
  const items = result.review.map((q, i) => ({ ...q, n: i + 1 })).filter((q) => showAll || q.picked !== q.answer);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className={cx('px-6 py-6 text-center text-white', pct >= 80 ? 'bg-emerald-600' : pct >= 40 ? 'bg-indigo-600' : 'bg-rose-600')}>
          <p className="text-sm font-semibold opacity-90">{result.title}</p>
          <p className="mt-2 text-5xl font-black tabular-nums">{result.score}<span className="text-2xl opacity-80">/{result.total}</span></p>
          <p className="mt-1 text-sm opacity-90">{pct}% · {result.name} ({result.roll}){result.auto ? ' · submitted automatically when time ran out' : ''}</p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{showAll ? 'All questions' : wrong ? `Review: ${wrong} wrong or unanswered` : 'All answers correct 🎉'}</h2>
        <Button size="sm" variant="secondary" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show only mistakes' : 'Show all questions'}</Button>
      </div>

      <ol className="space-y-3 pb-10">
        {items.map((q) => (
          <li key={q.n}>
            <Card className="p-4">
              <QuestionView q={q} n={q.n} src={token ? `/api/mcq/image?token=${encodeURIComponent(token)}&q=${q.n - 1}` : ''}>
                {(asPicture) => (
                  <div className={asPicture ? 'grid gap-1.5 sm:grid-cols-2' : 'space-y-1.5'}>
                    {q.options.map((opt, k) => {
                      const correct = k === q.answer, mine = k === q.picked;
                      // With a picture only the right answer and a wrong pick are listed.
                      if (asPicture && !correct && !mine) return null;
                      return (
                        <div key={k} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset', correct ? 'bg-emerald-50 ring-emerald-300' : mine ? 'bg-rose-50 ring-rose-300' : 'ring-slate-200')}>
                          {correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : mine ? <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" /> : <span className="size-4 shrink-0" />}
                          <span><b className="mr-1.5 text-slate-500">({optionLabel(q, k)})</b>{!asPicture && opt}
                            {correct && <span className="ml-2 text-xs font-semibold text-emerald-700">{mine ? 'Your answer — correct' : 'Correct answer'}</span>}
                            {mine && !correct && <span className="ml-2 text-xs font-semibold text-rose-700">Your answer</span>}
                          </span>
                        </div>
                      );
                    })}
                    {q.picked === null && <p className="text-xs font-semibold text-amber-700">You did not answer this one.</p>}
                  </div>
                )}
              </QuestionView>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
