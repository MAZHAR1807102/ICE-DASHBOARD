'use client';

import { useEffect, useRef } from 'react';

export type LeaveResult = { warnings: number; blocked: boolean };

// Strict mode for an exam page (MCQ exams and coding tests): reports every time the person leaves
// the page — another tab or app, minimising, another window in front for over 1.5 s, closing it.
// The server counts (1st = warning, 2nd = blocked) and answers; this hook only reports and passes the
// answer on. Several browser events from one leave are reported once. `paused` while the page is
// meant to be left (finished, blocked, "Save & leave"). With `closingCounts`, closing/reloading asks
// "Leave site?" first (the browser's own question).
export function useLeaveGuard({ active, paused, closingCounts, report, onWarning, onBlocked }: {
  active: boolean;
  paused: () => boolean;
  closingCounts: boolean;
  report: (kind: string) => Promise<LeaveResult | null>;
  onWarning: (warnings: number) => void;
  onBlocked: () => void;
}) {
  const last = useRef(0);
  const latest = useRef({ paused, report, onWarning, onBlocked });
  useEffect(() => { latest.current = { paused, report, onWarning, onBlocked }; });

  useEffect(() => {
    if (!active) return;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const left = (kind: string) => {
      const { paused: isPaused, report: send, onWarning: warn, onBlocked: block } = latest.current;
      if (isPaused()) return;
      const t = Date.now();
      if (t - last.current < 4000) return; // one leave, several browser events
      last.current = t;
      send(kind).then((r) => {
        if (!r) return;
        if (r.blocked) block();
        else if (r.warnings > 0) warn(r.warnings);
      }).catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') left('left the tab'); };
    const onBlur = () => { blurTimer = setTimeout(() => { if (!document.hasFocus()) left('switched to another window'); }, 1500); };
    const onFocus = () => clearTimeout(blurTimer);
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (closingCounts && !latest.current.paused()) e.preventDefault(); };
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
  }, [active, closingCounts]);
}

// keepalive: the report is delivered even if the page is being closed.
export const reportLeave = (url: string, token: string, kind: string): Promise<LeaveResult | null> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, kind }), keepalive: true })
    .then((r) => (r.ok ? r.json() : null));
