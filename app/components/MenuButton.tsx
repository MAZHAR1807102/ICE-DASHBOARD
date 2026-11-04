'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Button, cx } from './ui';

export type MenuItem = { label: string; hint?: string; icon?: LucideIcon; onClick: () => void; indent?: boolean };

// A button that opens a short list of actions (e.g. Exams → Documents). Closes on choice, outside click or Esc.
export default function MenuButton({ label, icon, items, variant = 'secondary', align = 'right' }: {
  label: string;
  icon?: LucideIcon;
  items: MenuItem[];
  variant?: 'primary' | 'secondary';
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant={variant} icon={icon} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {label}
        <ChevronDown className="size-4 opacity-60" aria-hidden />
      </Button>
      {open && (
        <div className={cx('absolute z-40 mt-2 w-72 animate-pop-in rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200', align === 'right' ? 'right-0' : 'left-0')} role="menu">
          {items.map(({ label: text, hint, icon: Icon, onClick, indent }) => (
            <button
              key={text}
              role="menuitem"
              onClick={() => { setOpen(false); onClick(); }}
              className={cx('flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-slate-100', indent && 'pl-9')}
            >
              {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />}
              <span>
                <span className={cx('block text-slate-700', indent ? 'text-xs' : 'text-sm')}>{text}</span>
                {hint && <span className="block text-xs text-slate-500">{hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
