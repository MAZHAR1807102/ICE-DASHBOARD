'use client';

import { useEffect, useRef } from 'react';
import { cx } from '../ui';

// More than this many characters arriving at once is not typing (paste, drop, an extension filling
// the box) — refused in locked mode.
const MAX_INSERT = 40;
const INDENT = '    ';

// A plain code editor: line numbers, Tab indents, Enter keeps the indent.
// `locked` (strict tests): no copy, cut, paste, drag-and-drop or right-click, and big insertions are
// refused; each attempt is reported with onBlocked so the page can say why nothing happened.
export default function CodeEditor({ value, onChange, locked = false, onBlocked, disabled, label, className }: {
  value: string;
  onChange: (value: string) => void;
  locked?: boolean;
  onBlocked?: (what: string) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  const lines = value.split('\n').length;

  // Put the caret back after an edit made here (Tab / Enter).
  useEffect(() => {
    if (caret.current !== null && area.current) {
      area.current.selectionStart = area.current.selectionEnd = caret.current;
      caret.current = null;
    }
  }, [value]);

  // `beforeinput` sees how text is arriving — refuse pasting/dropping however it is triggered
  // (keyboard, menu, phone keyboard's clipboard button).
  useEffect(() => {
    const el = area.current;
    if (!el || !locked) return;
    const stop = (e: InputEvent) => {
      const pasted = /^insertFrom(Paste|Drop|Yank|PasteAsQuotation)/.test(e.inputType);
      if (pasted || (e.data && e.data.length > MAX_INSERT)) {
        e.preventDefault();
        onBlocked?.('paste');
      }
    };
    el.addEventListener('beforeinput', stop);
    return () => el.removeEventListener('beforeinput', stop);
  }, [locked, onBlocked]);

  const block = (what: string) => (e: React.SyntheticEvent) => {
    if (!locked) return;
    e.preventDefault();
    onBlocked?.(what);
  };

  const edit = (next: string, at: number) => {
    caret.current = at;
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const key = e.key.toLowerCase();
    if (locked && ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'insert'].includes(key) || (e.shiftKey && key === 'insert'))) {
      e.preventDefault();
      onBlocked?.(key === 'c' || (e.ctrlKey && key === 'insert') ? 'copy' : key === 'x' ? 'cut' : 'paste');
      return;
    }
    const { selectionStart: a, selectionEnd: b } = el;
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) {
        // Remove one indent from the start of the current line.
        const start = value.lastIndexOf('\n', a - 1) + 1;
        const lead = value.slice(start, start + INDENT.length).match(/^ {1,4}|^\t/)?.[0] ?? '';
        if (lead) edit(value.slice(0, start) + value.slice(start + lead.length), Math.max(start, a - lead.length));
        return;
      }
      edit(value.slice(0, a) + INDENT + value.slice(b), a + INDENT.length);
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const start = value.lastIndexOf('\n', a - 1) + 1;
      const indent = value.slice(start, a).match(/^[ \t]*/)![0];
      const opens = /[{([]\s*$/.test(value.slice(start, a));
      const closes = /^\s*[})\]]/.test(value.slice(b));
      const inner = indent + (opens ? INDENT : '');
      const insert = opens && closes ? `\n${inner}\n${indent}` : `\n${inner}`;
      edit(value.slice(0, a) + insert + value.slice(b), a + 1 + inner.length);
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    // Last line of defence: a sudden big insertion that slipped past the events above.
    if (locked && next.length - value.length > MAX_INSERT) {
      onBlocked?.('paste');
      return;
    }
    onChange(next);
  };

  return (
    <div className={cx('flex overflow-hidden rounded-lg bg-slate-950 font-mono text-[13px] leading-5 ring-1 ring-slate-800', disabled && 'opacity-70', className)}>
      <div ref={gutter} aria-hidden className="select-none overflow-hidden bg-slate-900 px-2 py-3 text-right text-slate-500">
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea
        ref={area}
        value={value}
        onChange={onInput}
        onKeyDown={onKeyDown}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        onPaste={block('paste')}
        onCopy={block('copy')}
        onCut={block('cut')}
        onDrop={block('paste')}
        onDragStart={block('copy')}
        onContextMenu={block('right-click')}
        disabled={disabled}
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        className="min-h-0 flex-1 resize-none bg-transparent px-3 py-3 text-slate-100 caret-emerald-400 outline-none selection:bg-indigo-500/40"
      />
    </div>
  );
}
