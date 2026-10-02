'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGpa } from '../../../utils/grades';

// GPA by semester on a fixed 0–4 scale. Single series: 2px line, ringed dots,
// hairline grid, latest value labelled, hover crosshair + tooltip.
// Drawn at the container's real width so text stays the same size on any screen.
const H = 240;
const PAD = { left: 40, right: 48, top: 20, bottom: 36 };
const LINE = '#4f46e5'; // indigo-600
const GRID = '#e2e8f0'; // slate-200
const TICKS = [0, 1, 2, 3, 4];

export default function GpaChart({ points }: { points: { semester: number; gpa: number; credits: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (gpa: number) => PAD.top + plotH - (gpa / 4) * plotH;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.gpa)}`).join(' ');
  const last = points.length - 1;
  const hovered = hover !== null ? points[hover] : null;

  return (
    <figure ref={ref} className="relative" aria-label="GPA by semester">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" onMouseLeave={() => setHover(null)}>
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[11px]">{t.toFixed(1)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.semester} x={x(i)} y={H - 12} textAnchor="middle" className="fill-slate-500 text-[11px] font-medium">Sem {p.semester}</text>
        ))}

        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#cbd5e1" strokeWidth={1} />}
        {points.length > 1 && <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <circle key={p.semester} cx={x(i)} cy={y(p.gpa)} r={hover === i ? 6 : 4.5} fill={LINE} stroke="white" strokeWidth={2} />
        ))}
        <text x={x(last) + 10} y={y(points[last].gpa)} dominantBaseline="middle" className="fill-slate-800 text-[13px] font-bold">
          {formatGpa(points[last].gpa)}
        </text>

        {/* Hit areas wider than the marks */}
        {points.map((p, i) => {
          const half = points.length === 1 ? plotW / 2 : plotW / (points.length - 1) / 2;
          return (
            <rect key={p.semester} x={x(i) - half} y={PAD.top} width={half * 2} height={plotH} fill="transparent"
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`Semester ${p.semester}: GPA ${formatGpa(p.gpa)}`} />
          );
        })}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hovered.gpa) / H) * 100}%`, marginTop: -10 }}
        >
          <p className="font-bold">Semester {hovered.semester}</p>
          <p>GPA {formatGpa(hovered.gpa)} · {hovered.credits} credits</p>
        </div>
      )}
    </figure>
  );
}
