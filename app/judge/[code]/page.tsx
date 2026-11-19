'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Ban, CheckCircle2, Clock, Code2, Flag, KeyRound, LogOut, Play, Send, ShieldAlert, Trophy } from 'lucide-react';
import Brand from '../../components/Brand';
import CodeEditor from '../../components/judge/CodeEditor';
import { Badge, Button, Card, Field, cx, inputClass } from '../../components/ui';
import { useConfirm, useToast } from '../../components/Providers';
import { supabase } from '../../../utils/supabase';
import { KINDS, LANGUAGES, VERDICTS, isFinal, isTimedKind, type LanguageId, type ShownProblem, type TestKind } from '../../../utils/judge';
import type { ShownSubmission, TestView } from '../../../utils/judge-server';

type Info = {
  title: string; kind: TestKind; semester: number | null; status: 'open' | 'closed'; strict: boolean;
  duration: number | null; endsAt: string | null; languages: LanguageId[]; count: number; author: string;
  me: { name: string; roll: string; ownSemester: boolean; token: string | null; blocked: boolean } | null;
};

// The token for this test on this device, so a reload resumes it.
const tokenKey = (code: string) => `judge.${code}`;
const readToken = (code: string) => { try { return localStorage.getItem(tokenKey(code)); } catch { return null; } };
const saveToken = (code: string, token: string | null) => { try { if (token) localStorage.setItem(tokenKey(code), token); else localStorage.removeItem(tokenKey(code)); } catch { /* private mode */ } };
const draftKey = (code: string, problem: string, lang: string) => `judge.${code}.${problem}.${lang}`;
const readDraft = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const saveDraft = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* full or private */ } };

const post = (url: string, body: unknown, keepalive = false) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive })
  .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
const letter = (i: number) => String.fromCharCode(65 + i);

// Public page (no proxy rule): /judge/<code>. Signed-in students of the test's semester join as
// themselves; anyone else enters the password, their name and roll.
export default function JudgeTestPage() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<TestView | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetch(`/api/judge/info?code=${encodeURIComponent(code)}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error ?? 'Could not load this test.');
      const i = body as Info;
      setInfo(i);
      if (i.me?.blocked) return setBlocked(true);
      const saved = i.me?.token ?? readToken(code);
      if (!saved) return;
      const state = await fetch(`/api/judge/state?token=${encodeURIComponent(saved)}`);
      if (!state.ok) return saveToken(code, null);
      const v = (await state.json()) as TestView;
      if (v.state === 'blocked') return setBlocked(true);
      setToken(saved);
      setView(v);
    }).catch(() => setError('Could not load this test. Check your internet connection.'));
  }, [code]);

  // Blocked: logged out of the portal and off this test until the HOD unblocks them.
  const blockedOut = useCallback(async () => {
    saveToken(code, null);
    setBlocked(true);
    setView(null);
    setToken(null);
    await supabase.auth.signOut().catch(() => {});
  }, [code]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {!(view?.state === 'running' && token) && (
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center px-4"><Brand subtitle="Coding test" href="/" /></div>
        </header>
      )}
      {error ? (
        <main className="mx-auto max-w-3xl px-4 py-6"><Card className="p-8 text-center"><p className="font-semibold text-slate-900">{error}</p></Card></main>
      ) : blocked ? (
        <main className="mx-auto max-w-3xl px-4 py-6"><BlockedNotice /></main>
      ) : !info ? (
        <p className="py-16 text-center text-sm text-slate-500">Loading…</p>
      ) : view?.state === 'running' && token ? (
        <Workspace code={code} token={token} initial={view} onView={setView} onBlocked={blockedOut} />
      ) : view && token ? (
        <main className="mx-auto max-w-6xl px-4 py-6"><Finished view={view} /></main>
      ) : (
        <main className="mx-auto max-w-3xl px-4 py-6">
          <Join code={code} info={info} onStarted={(t, v) => { saveToken(code, t); setToken(t); setView(v); }} onBlocked={() => setBlocked(true)} />
        </main>
      )}
    </div>
  );
}

function BlockedNotice() {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center gap-3 bg-rose-600 px-6 py-8 text-center text-white">
        <Ban className="size-10" aria-hidden />
        <h1 className="text-xl font-bold">You are blocked from this test</h1>
      </div>
      <div className="space-y-2 p-6 text-center text-sm text-slate-600">
        <p>You left the test page a second time, so you were logged out and blocked.</p>
        <p>Only the <b>HOD</b> can unblock you. Contact your teacher or the department.</p>
      </div>
    </Card>
  );
}

function Join({ code, info, onStarted, onBlocked }: { code: string; info: Info; onStarted: (token: string, view: TestView) => void; onBlocked: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsPassword = !info.me?.ownSemester;
  const timed = isTimedKind(info.kind);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { ok, body } = await post('/api/judge/join', { code, name, roll, password, token: readToken(code) })
      .catch(() => ({ ok: false, body: { error: 'Could not reach the server. Check your internet connection.' } }));
    setBusy(false);
    if (!ok) {
      if (/blocked/i.test(body.error ?? '')) return onBlocked();
      return toast.error(body.error ?? 'Could not start the test.');
    }
    if (body.view?.state === 'blocked') return onBlocked();
    onStarted(body.token, body.view);
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-slate-900 to-indigo-800 px-6 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">{KINDS[info.kind].label}{info.author ? ` · ${info.author}` : ''}</p>
        <h1 className="mt-1 text-2xl font-bold">{info.title}</h1>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-indigo-100">
          <span className="flex items-center gap-1.5"><Code2 className="size-4" />{info.count} problem{info.count === 1 ? '' : 's'} · {info.languages.map((l) => LANGUAGES[l].label).join(', ')}</span>
          {info.duration && <span className="flex items-center gap-1.5"><Clock className="size-4" />{info.duration} minutes</span>}
          {info.endsAt && <span className="flex items-center gap-1.5"><Flag className="size-4" />Deadline {when(info.endsAt)}</span>}
        </div>
      </div>
      {info.status !== 'open' ? (
        <p className="p-6 text-center font-semibold text-slate-700">This test is closed.</p>
      ) : (
        <form onSubmit={start} className="space-y-4 p-6">
          {info.strict && (
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
              <p className="flex items-center gap-2 font-bold"><ShieldAlert className="size-4" aria-hidden /> Rules of this test</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><b>Copy and paste are turned off</b> in the code editor. Type your code yourself.</li>
                <li><b>Do not leave the test page</b> — no other tabs, apps or windows{timed ? ', and do not close or reload the page' : ''}.</li>
                <li>The <b>first time</b> you leave, you get a warning. The <b>second time</b>, you are <b>logged out and blocked</b> until the HOD unblocks you.</li>
                {!timed && <li>To stop and continue later, press <b>Save &amp; leave</b> first.</li>}
              </ul>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {info.duration && <li>The timer starts when you press <b>Start</b> and keeps running even if the page is closed.</li>}
            <li>Read each problem, write your solution, test it with <b>Run</b>, then press <b>Submit</b>. Your best submission counts.</li>
            {info.languages.includes('java') && <li>In Java, the class must be named <code className="rounded bg-slate-100 px-1">Main</code>.</li>}
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
            <Field label="Test password"><input required value={password} onChange={(e) => setPassword(e.target.value.trim())} autoCapitalize="characters" className={cx(inputClass, 'font-mono uppercase')} /></Field>
          )}
          {info.strict && (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
              <span>I have read the rules. I understand that leaving the page twice blocks me from this test.</span>
            </label>
          )}
          <Button type="submit" size="lg" icon={needsPassword ? KeyRound : undefined} loading={busy} disabled={info.strict && !agreed} className="w-full">{info.me?.token ? 'Continue' : 'Start'}</Button>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// The running test: problems, editor, submissions — and strict mode.
// ---------------------------------------------------------------------------------------------
function Workspace({ code, token, initial, onView, onBlocked }: { code: string; token: string; initial: TestView; onView: (v: TestView) => void; onBlocked: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState(initial);
  const [tab, setTab] = useState<number | 'board'>(0);
  const [language, setLanguage] = useState<LanguageId>(initial.test.languages[0] ?? 'c');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<{ verdict: string; ok: boolean; stdout: string; stderr: string; compile: string; time: number | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState(false);
  const [warned, setWarned] = useState(initial.me.warnings > 0);
  const [exited, setExited] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [offset] = useState(() => new Date(initial.now).getTime() - Date.now());
  const leaving = useRef(false); // true while the page is meant to be left (finished, blocked, Save & leave)
  const lastReport = useRef(0);
  const warnings = useRef(initial.me.warnings);

  const { test } = view;
  const timed = isTimedKind(test.kind);
  const problem: ShownProblem | undefined = typeof tab === 'number' ? view.problems[tab] : undefined;
  const key = problem ? draftKey(code, problem.id, language) : '';
  const source = problem ? drafts[key] ?? readDraft(key) ?? LANGUAGES[language].starter : '';
  const deadline = view.deadline ? new Date(view.deadline).getTime() : null;
  const left = deadline === null ? null : deadline - (now + offset);

  const setSource = (value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    saveDraft(key, value);
  };

  const apply = useCallback((v: TestView) => {
    if (v.state === 'blocked') { leaving.current = true; onBlocked(); return; }
    if (v.state !== 'running') { leaving.current = true; onView(v); return; }
    warnings.current = Math.max(warnings.current, v.me.warnings);
    if (v.me.warnings > 0) setWarned(true);
    setView(v);
  }, [onBlocked, onView]);

  const refresh = useCallback(() => {
    fetch(`/api/judge/state?token=${encodeURIComponent(token)}`).then((r) => (r.ok ? r.json() : null)).then((v) => v && apply(v)).catch(() => {});
  }, [token, apply]);

  // ---- Strict mode: leaving the page (another tab/app/window, minimising, closing) ----
  useEffect(() => {
    if (!test.strict) return;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const report = (kind: string) => {
      if (leaving.current) return;
      const t = Date.now();
      if (t - lastReport.current < 4000) return; // one leave, several browser events
      lastReport.current = t;
      // keepalive: delivered even if the page is being closed.
      post('/api/judge/violation', { token, kind }, true).then(({ ok, body }) => {
        if (!ok) return;
        if (body.blocked) { leaving.current = true; onBlocked(); return; }
        if (body.warnings > warnings.current) { warnings.current = body.warnings; setWarned(true); setWarning(true); }
      }).catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') report('left the tab'); };
    // Another window/app in front while this one is still visible: counted if it lasts over 1.5 s.
    const onBlur = () => { blurTimer = setTimeout(() => { if (!document.hasFocus()) report('switched to another window'); }, 1500); };
    const onFocus = () => clearTimeout(blurTimer);
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (!leaving.current && timed) e.preventDefault(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [test.strict, timed, token, onBlocked]);

  // Clock; when time is up the server says the test is over.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (deadline !== null && t + offset > deadline + 1000 && !leaving.current) refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, offset, refresh]);

  // Fresh state every 20 s (the teacher may close the test; contest ranking).
  useEffect(() => {
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Submissions waiting for the judge are checked every few seconds.
  const waiting = view.submissions.filter((s) => !isFinal(s.status)).map((s) => s.id).join(',');
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => {
      for (const sid of waiting.split(',')) {
        fetch(`/api/judge/submission?token=${encodeURIComponent(token)}&id=${sid}`).then((r) => (r.ok ? r.json() : null)).then((s: ShownSubmission | null) => {
          if (!s || !isFinal(s.status)) return;
          setView((v) => ({ ...v, submissions: v.submissions.map((x) => (x.id === s.id ? s : x)) }));
          const p = view.problems.find((x) => x.id === s.problem_id);
          if (s.status === 'AC') toast.success(`${p?.title ?? 'Problem'}: Accepted!`);
          else toast.info(`${p?.title ?? 'Problem'}: ${VERDICTS[s.status].label}${s.passed !== null && s.total ? ` (${s.passed}/${s.total} tests)` : ''}`);
        }).catch(() => {});
      }
    }, view.judgeReady ? 2500 : 15_000);
    return () => clearInterval(id);
  }, [waiting, token, toast, view.problems, view.judgeReady]);

  const blockedAction = useCallback((what: string) => {
    toast.error(what === 'right-click' ? 'Right-click is turned off in this test.' : `${what[0].toUpperCase()}${what.slice(1)} is turned off in this test — type your code.`);
  }, [toast]);

  const run = async () => {
    if (!problem) return;
    setRunning(true);
    const { ok, body } = await post('/api/judge/run', { token, problemId: problem.id, language, source, input }).catch(() => ({ ok: false, body: { error: 'Could not reach the server.' } }));
    setRunning(false);
    if (!ok) return toast.error(body.error ?? 'Could not run the code.');
    setOutput(body);
  };

  const submit = async () => {
    if (!problem) return;
    if (!(await confirm({ title: `Submit your ${LANGUAGES[language].label} solution?`, body: `For "${problem.title}". It is judged on hidden test cases; you can submit again — your best submission counts.`, confirmLabel: 'Submit' }))) return;
    setSubmitting(true);
    const { ok, body } = await post('/api/judge/submit', { token, problemId: problem.id, language, source }).catch(() => ({ ok: false, body: { error: 'Could not reach the server.' } }));
    setSubmitting(false);
    if (!ok) return toast.error(body.error ?? 'Could not submit.');
    setView((v) => ({ ...v, submissions: [body as ShownSubmission, ...v.submissions] }));
    toast.success(view.judgeReady ? 'Submitted — judging…' : 'Submitted. The judge server is not connected yet; it will be judged later.');
  };

  const finish = async () => {
    if (!(await confirm({ title: 'Finish the test?', body: 'You cannot submit anything after finishing. Submissions still being judged will be judged.', confirmLabel: 'Finish test', tone: 'danger' }))) return;
    leaving.current = true;
    const { ok, body } = await post('/api/judge/finish', { token });
    if (!ok) { leaving.current = false; return toast.error(body.error ?? 'Could not finish.'); }
    onView(body as TestView);
  };

  const saveAndLeave = () => {
    leaving.current = true;
    setExited(true);
  };

  if (exited) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Card className="space-y-4 p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
          <p className="font-semibold text-slate-900">Your code is saved on this device. You can close this page now.</p>
          <p className="text-sm text-slate-500">Open the test link again to continue{deadline ? ` before ${when(new Date(deadline).toISOString())}` : ''}.</p>
          <Button onClick={() => { leaving.current = false; setExited(false); }}>Continue the test</Button>
        </Card>
      </main>
    );
  }

  const mine = problem ? view.submissions.filter((s) => s.problem_id === problem.id) : [];
  const best = (pid: string) => Math.max(0, ...view.submissions.filter((s) => s.problem_id === pid).map((s) => s.score ?? 0));
  const solved = (pid: string) => view.submissions.some((s) => s.problem_id === pid && s.status === 'AC');

  return (
    <div className={cx(test.strict && 'select-none')} onCopy={(e) => { if (test.strict) e.preventDefault(); }} onContextMenu={(e) => { if (test.strict) e.preventDefault(); }}>
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{test.title}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <span>{view.me.name} · {view.me.roll}</span>
              {test.strict && (warned
                ? <span className="font-semibold text-rose-600">⚠ Warning given — leaving again blocks you</span>
                : <span>Strict mode: stay on this page</span>)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {left !== null && (
              <div className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums', left < 60_000 ? 'bg-rose-100 text-rose-700' : left < 300_000 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800')} role="timer" aria-label="Time left">
                <Clock className="size-4" aria-hidden />{clock(left)}
              </div>
            )}
            {timed
              ? <Button size="sm" variant="danger" icon={Flag} onClick={finish}>Finish</Button>
              : <Button size="sm" variant="secondary" icon={LogOut} onClick={saveAndLeave}>Save &amp; leave</Button>}
          </div>
        </div>
        <div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4 pb-2" role="tablist">
          {view.problems.map((p, i) => (
            <button key={p.id} role="tab" aria-selected={tab === i} onClick={() => { setTab(i); setOutput(null); }}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold', tab === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
              {letter(i)}. <span className="max-w-40 truncate">{p.title}</span>
              {solved(p.id) ? <CheckCircle2 className="size-4 text-emerald-400" aria-label="solved" /> : best(p.id) > 0 && test.kind !== 'practice' && <span className="text-xs opacity-80">{best(p.id)}</span>}
            </button>
          ))}
          {view.board && (
            <button role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold', tab === 'board' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
              <Trophy className="size-4" aria-hidden /> Ranking
            </button>
          )}
        </div>
      </div>

      {!view.judgeReady && (
        <p className="mx-auto mt-3 max-w-[1500px] px-4 text-xs text-amber-800"><span className="rounded-lg bg-amber-50 px-3 py-1.5 ring-1 ring-amber-200">The judge server is not connected yet. You can write and submit; submissions will be judged once it is connected. “Run” is not available until then.</span></p>
      )}

      {tab === 'board' && view.board ? (
        <main className="mx-auto max-w-[1500px] px-4 py-4"><Board board={view.board} problems={view.problems} /></main>
      ) : problem ? (
        <main className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 lg:grid-cols-2">
          <Card className="space-y-4 p-5 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{letter(tab as number)}. {problem.title}</h1>
              <p className="mt-1 text-xs text-slate-500">Time limit {problem.time_limit_ms / 1000} s · Memory {problem.memory_mb} MB{test.kind !== 'practice' && test.kind !== 'contest' ? ` · ${problem.points} marks` : ''}</p>
            </div>
            <Section title="Problem" text={problem.statement} />
            <Section title="Input" text={problem.input_format} />
            <Section title="Output" text={problem.output_format} />
            {problem.samples.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <Sample title={`Sample input ${i + 1}`} text={s.input} action={<button type="button" onClick={() => setInput(s.input)} className="text-xs font-semibold text-indigo-600 hover:underline">Use as input</button>} />
                <Sample title={`Sample output ${i + 1}`} text={s.output} />
              </div>
            ))}
          </Card>

          <div className="space-y-3">
            <Card className="space-y-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select value={language} onChange={(e) => setLanguage(e.target.value as LanguageId)} className={cx(inputClass, 'w-auto')} aria-label="Language">
                  {test.languages.map((l) => <option key={l} value={l}>{LANGUAGES[l].label}</option>)}
                </select>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={Play} loading={running} disabled={!view.judgeReady} onClick={run}>Run</Button>
                  <Button size="sm" icon={Send} loading={submitting} onClick={submit}>Submit</Button>
                </div>
              </div>
              <CodeEditor value={source} onChange={setSource} locked={test.strict} onBlocked={blockedAction} label={`Code for ${problem.title}`} className="h-[46vh] min-h-72" />
              {test.strict && <p className="text-[11px] text-slate-500">Copy, paste and right-click are turned off in this test.</p>}
            </Card>

            <Card className="grid gap-3 p-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Your input (for Run)</p>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} spellCheck={false}
                  onPaste={(e) => { if (test.strict) { e.preventDefault(); blockedAction('paste'); } }}
                  className={cx(inputClass, 'font-mono text-xs')} aria-label="Input for Run" />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Output {output && <span className={output.ok ? 'text-emerald-700' : 'text-rose-700'}>· {output.verdict}{output.time !== null ? ` · ${output.time} s` : ''}</span>}</p>
                <pre className="h-[7.5rem] overflow-auto rounded-lg bg-slate-950 p-2 font-mono text-xs text-slate-100">{output ? (output.compile || output.stdout || output.stderr || '(no output)') : 'Press Run to see what your code prints.'}{output?.stderr && output.stdout ? `\n${output.stderr}` : ''}</pre>
              </div>
            </Card>

            <Card className="p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">My submissions for this problem</p>
              {mine.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {mine.map((s) => <SubmissionRow key={s.id} s={s} showScore={test.kind !== 'practice' && test.kind !== 'contest'} />)}
                </ul>
              )}
            </Card>
          </div>
        </main>
      ) : (
        <p className="py-16 text-center text-sm text-slate-500">This test has no problems.</p>
      )}

      {warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="leave-warning">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 bg-amber-500 px-5 py-4 text-white">
              <AlertTriangle className="size-7 shrink-0" aria-hidden />
              <p id="leave-warning" className="text-lg font-bold">Warning: you left the test page</p>
            </div>
            <div className="space-y-3 p-5 text-sm text-slate-700">
              <p>This has been recorded and your teacher can see it.</p>
              <p className="font-semibold text-rose-700">If you leave the page again, you will be logged out and blocked from this test until the HOD unblocks you.</p>
              <Button className="w-full" onClick={() => setWarning(false)}>I understand — back to the test</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <section>
      <h2 className="mb-1 text-sm font-bold text-slate-900">{title}</h2>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</p>
    </section>
  );
}

function Sample({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><p className="text-xs font-semibold text-slate-600">{title}</p>{action}</div>
      <pre className="overflow-x-auto rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-800">{text || ' '}</pre>
    </div>
  );
}

function SubmissionRow({ s, showScore }: { s: ShownSubmission; showScore: boolean }) {
  const v = VERDICTS[s.status];
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Badge tone={v.tone} dot>{v.label}</Badge>
          {s.passed !== null && s.total !== null && s.status !== 'CE' && <span className="text-xs text-slate-500">{s.passed}/{s.total} tests{s.failed_test ? ` · failed on test ${s.failed_test}` : ''}</span>}
        </span>
        <span className="text-xs text-slate-500">
          {showScore && s.score !== null && <b className="mr-2 text-slate-700">{s.score}/{s.points}</b>}
          {LANGUAGES[s.language].label} · {when(s.created_at)}{s.time_ms !== null && isFinal(s.status) ? ` · ${s.time_ms} ms` : ''}
        </span>
      </div>
      {s.message && <pre className="mt-1.5 max-h-40 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-rose-200">{s.message}</pre>}
    </li>
  );
}

function Board({ board, problems }: { board: NonNullable<TestView['board']>; problems: ShownProblem[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Solved</th><th className="px-3 py-2">Penalty</th>
            {problems.map((p, i) => <th key={p.id} className="px-3 py-2 text-center" title={p.title}>{letter(i)}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {board.map((r, i) => (
            <tr key={r.roll} className={r.me ? 'bg-indigo-50' : undefined}>
              <td className="px-3 py-2 text-slate-500">{i + 1}</td>
              <td className="px-3 py-2"><span className="font-medium text-slate-900">{r.name}</span> <span className="font-mono text-xs text-slate-500">{r.roll}</span></td>
              <td className="px-3 py-2 font-bold tabular-nums">{r.total}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">{r.penalty}</td>
              {r.problems.map((x, k) => (
                <td key={k} className={cx('px-3 py-2 text-center text-xs font-semibold', x.solved ? 'bg-emerald-50 text-emerald-700' : x.tries ? 'bg-rose-50 text-rose-700' : 'text-slate-300')}>
                  {x.solved ? `✓${x.tries > 1 ? ` (${x.tries})` : ''}` : x.tries ? `−${x.tries}` : '·'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// Over (finished, time up, or test closed): what they got.
function Finished({ view }: { view: TestView }) {
  const scored = view.test.kind !== 'practice' && view.test.kind !== 'contest';
  const rows = view.problems.map((p, i) => {
    const subs = view.submissions.filter((s) => s.problem_id === p.id);
    return { p, i, best: Math.max(0, ...subs.map((s) => s.score ?? 0)), solved: subs.some((s) => s.status === 'AC'), count: subs.length, waiting: subs.some((s) => !isFinal(s.status)) };
  });
  const total = rows.reduce((s, r) => s + r.best, 0);
  const out = rows.reduce((s, r) => s + r.p.points, 0);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-800 px-6 py-6 text-center text-white">
          <p className="text-sm font-semibold opacity-90">{view.test.title}</p>
          {scored
            ? <p className="mt-2 text-5xl font-black tabular-nums">{Math.round(total * 100) / 100}<span className="text-2xl opacity-80">/{out}</span></p>
            : <p className="mt-2 text-5xl font-black tabular-nums">{rows.filter((r) => r.solved).length}<span className="text-2xl opacity-80">/{rows.length} solved</span></p>}
          <p className="mt-1 text-sm opacity-90">{view.me.name} ({view.me.roll}) · this test is over for you</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="font-medium text-slate-900">{letter(r.i)}. {r.p.title}</span>
              <span className="text-slate-600">
                {r.waiting ? 'still being judged · ' : ''}{r.count} submission{r.count === 1 ? '' : 's'}
                {scored ? <b className="ml-2 text-slate-900">{r.best}/{r.p.points}</b> : r.solved ? <b className="ml-2 text-emerald-700">Solved</b> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {view.board && <Board board={view.board} problems={view.problems} />}
    </div>
  );
}
