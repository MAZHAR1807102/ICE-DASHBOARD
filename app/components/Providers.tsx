'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button } from './ui';

// ---------- Toasts: non-blocking messages in place of alert() ----------
type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: number; tone: ToastTone; message: string };
type ToastApi = { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void };

// ---------- Confirm: a styled replacement for window.confirm() ----------
type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; tone?: 'primary' | 'danger' };

const ToastContext = createContext<ToastApi | null>(null);
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export const useToast = () => useContext(ToastContext)!;
export const useConfirm = () => useContext(ConfirmContext)!;

const TOAST_STYLE = {
  success: { icon: CheckCircle2, ring: 'ring-emerald-200', iconClass: 'text-emerald-600' },
  error: { icon: XCircle, ring: 'ring-rose-200', iconClass: 'text-rose-600' },
  info: { icon: Info, ring: 'ring-slate-200', iconClass: 'text-indigo-600' },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: ToastTone, message: string) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 5000);
  }, [dismiss]);

  const toastApi = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push]);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);
  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
          {toasts.map((t) => {
            const { icon: Icon, ring, iconClass } = TOAST_STYLE[t.tone];
            return (
              <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ${ring}`}>
                <Icon className={`mt-0.5 size-5 shrink-0 ${iconClass}`} aria-hidden />
                <p className="flex-1 whitespace-pre-line text-sm text-slate-700">{t.message}</p>
                <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss"><X className="size-4" /></button>
              </div>
            );
          })}
        </div>

        {dialog && (
          <div className="fixed inset-0 z-[150] flex animate-fade-in items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center" role="alertdialog" aria-modal="true">
            <div className="w-full max-w-md animate-pop-in rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex gap-4">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${dialog.tone === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  <AlertTriangle className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">{dialog.title}</h3>
                  {dialog.body && <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{dialog.body}</p>}
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
                <Button variant={dialog.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                  {dialog.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
