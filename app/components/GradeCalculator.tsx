'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';
import Modal from './Modal';
import { Badge, Button, Field, cx, inputClass, table } from './ui';
import { GRADE_BANDS, GRADE_POINTS, gradeForMarks } from '../../utils/grades';

const toneFor = (grade: string) => (grade === 'F' ? 'rose' : grade.startsWith('A') ? 'emerald' : grade.startsWith('B') ? 'indigo' : 'amber');
const num = (n: number) => String(Math.round(n * 100) / 100);

// Marks → grade and grade point (out of 4) on the UGC scale. Out of 25 by default; any total works.
export function GradeCalculatorModal({ onClose }: { onClose: () => void }) {
  const [outOf, setOutOf] = useState('25');
  const [marks, setMarks] = useState('');
  const [many, setMany] = useState('');

  const total = Number(outOf);
  const validTotal = total > 0;
  const mark = marks.trim() === '' ? null : Number(marks);
  const markError = mark !== null && (Number.isNaN(mark) || mark < 0 || (validTotal && mark > total));
  const result = mark !== null && !markError && validTotal ? gradeForMarks(mark, total) : null;

  // One student per line: the last number is the mark, anything before it (roll, name) is a label.
  // Commas split a line into several marks.
  const rows = many.split('\n').flatMap((line) => {
    if (/[,;]/.test(line)) return line.split(/[,;]/).map((p) => p.trim()).filter(Boolean).map((p) => ({ label: '', value: Number(p) }));
    const parts = line.trim().split(/\s+/).filter(Boolean);
    return parts.length ? [{ label: parts.slice(0, -1).join(' '), value: Number(parts[parts.length - 1]) }] : [];
  });

  return (
    <Modal title="Grade calculator" description="Marks → grade and grade point out of 4 (UGC scale, same as RU results)." size="lg" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marks obtained">
            <input type="number" inputMode="decimal" step="any" min={0} value={marks} onChange={(e) => setMarks(e.target.value)} placeholder="e.g. 21" className={inputClass} autoFocus />
          </Field>
          <Field label="Out of">
            <input type="number" inputMode="decimal" step="any" min={1} value={outOf} onChange={(e) => setOutOf(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {!validTotal && <p className="text-sm text-rose-600">Enter the full marks (more than 0).</p>}
        {markError && validTotal && <p className="text-sm text-rose-600">Marks must be between 0 and {num(total)}.</p>}
        {result && (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center ring-1 ring-slate-200">
            <div><p className="text-xs font-medium text-slate-500">Grade</p><p className={cx('text-3xl font-bold', result.grade === 'F' ? 'text-rose-600' : 'text-slate-900')}>{result.grade}</p></div>
            <div><p className="text-xs font-medium text-slate-500">Grade point</p><p className="text-3xl font-bold text-indigo-600">{result.point.toFixed(2)}</p></div>
            <div><p className="text-xs font-medium text-slate-500">Percentage</p><p className="text-3xl font-bold text-slate-900">{num(result.percent)}%</p></div>
          </div>
        )}

        {validTotal && (
          <div className={cx(table.wrap, 'rounded-xl ring-1 ring-slate-200')}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Point</th><th className="px-3 py-2">Percentage</th><th className="px-3 py-2">Marks (of {num(total)})</th></tr>
              </thead>
              <tbody className={table.body}>
                {GRADE_BANDS.map((b, i) => {
                  const upper = i === 0 ? null : GRADE_BANDS[i - 1].from;
                  const lo = (b.from * total) / 100;
                  return (
                    <tr key={b.grade} className={cx(result?.grade === b.grade && 'bg-indigo-50')}>
                      <td className="px-3 py-1.5 font-semibold">{b.grade}</td>
                      <td className="px-3 py-1.5 tabular-nums">{GRADE_POINTS[b.grade].toFixed(2)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{upper === null ? `${b.from}% and above` : b.grade === 'F' ? `below ${upper}%` : `${b.from}% to below ${upper}%`}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{upper === null ? `${num(lo)} and above` : b.grade === 'F' ? `below ${num((upper * total) / 100)}` : `${num(lo)} to below ${num((upper * total) / 100)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Field label="Many students at once" hint="One student per line: a mark, or a roll/name then the mark (e.g. “24161 21.5”). Columns copied from Excel work too.">
          <textarea rows={4} value={many} onChange={(e) => setMany(e.target.value)} placeholder={'24161 21.5\n24162 17\n24163 9'} className={cx(inputClass, 'font-mono')} />
        </Field>
        {validTotal && rows.length > 0 && (
          <div className={cx(table.wrap, 'max-h-72 rounded-xl ring-1 ring-slate-200')}>
            <table className={table.table}>
              <thead className={table.head}><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Roll / name</th><th className="px-3 py-2">Marks</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Point</th></tr></thead>
              <tbody className={table.body}>
                {rows.map((r, i) => {
                  const bad = Number.isNaN(r.value) || r.value < 0 || r.value > total;
                  const g = bad ? null : gradeForMarks(r.value, total);
                  return (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-1.5">{r.label || '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums">{Number.isNaN(r.value) ? '?' : num(r.value)}</td>
                      <td className="px-3 py-1.5">{g ? <Badge tone={toneFor(g.grade)}>{g.grade}</Badge> : <span className="text-xs text-rose-600">not a mark of {num(total)}</span>}</td>
                      <td className="px-3 py-1.5 tabular-nums">{g ? g.point.toFixed(2) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

// A button that opens the calculator. compact: icon only on phones.
export default function GradeCalculatorButton({ className, size, compact }: { className?: string; size?: 'xs' | 'sm' | 'md'; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size={size} icon={Calculator} onClick={() => setOpen(true)} className={className} aria-label="Grade calculator">
        {compact ? <span className="hidden sm:inline">Grade calculator</span> : 'Grade calculator'}
      </Button>
      {/* Rendered on <body>: a blurred sticky header would otherwise trap the fixed overlay inside it. */}
      {open && createPortal(<GradeCalculatorModal onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
