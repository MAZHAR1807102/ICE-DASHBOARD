'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGpa } from '../../../utils/grades';

// Semester GPA and running CGPA on one fixed 0–4 scale. 2px lines, ringed dots, hairline grid,
// legend + end labels (dropped when the two ends would collide), hover crosshair + tooltip.
// Drawn at the container's real width so text stays the same size on any screen.
const H = 240;
const PAD = { left: 40, right: 52, top: 20, bottom: 36 };
const GPA_COLOR = '#4f46e5'; // indigo-600
const CGPA_COLOR = '#0d9488'; // teal-600 — validated against indigo for colour-blind separation
const GRID = '#e2e8f0'; // slate-200
const TICKS = [0, 1, 2, 3, 4];

type Point = { semester: number; gpa: number; credits: number; cgpa?: number };

export default function GpaChart({ points, selected, onSelect }: { points: Point[]; selected?: number; onSelect?: (semester: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const showCgpa = points.some((p) => p.cgpa !== undefined) && points.length > 0;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (v: number) => PAD.top + plotH - (v / 4) * plotH;
  const pathOf = (pick: (p: Point) => number | undefined) =>
    points.map((p, i) => (pick(p) === undefined ? '' : `${i ? 'L' : 'M'}${x(i)},${y(pick(p)!)}`)).join(' ');
  const last = points.length - 1;
  const hovered = hover !== null ? points[hover] : null;
  const endGap = showCgpa && points[last]?.cgpa !== undefined ? Math.abs(y(points[last].gpa) - y(points[last].cgpa!)) : Infinity;
  const labelEnds = endGap >= 14;

  return (
    <figure ref={ref} className="relative" aria-label="GPA and CGPA by semester">
      {showCgpa && (
        <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: GPA_COLOR }} aria-hidden />Semester GPA</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: CGPA_COLOR }} aria-hidden />Running CGPA</span>
        </figcaption>
      )}
      {points.length > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" onMouseLeave={() => setHover(null)}>
          {/* Selected semester: a soft band behind everything, kept inside the plot area */}
          {points.map((p, i) => {
            if (p.semester !== selected) return null;
            const left = Math.max(PAD.left, x(i) - 18);
            const right = Math.min(W - PAD.right + 12, x(i) + 18);
            return <rect key={`sel-${p.semester}`} x={left} y={PAD.top - 6} width={right - left} height={plotH + 12} rx={8} fill="#eef2ff" />;
          })}
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
          {points.length > 1 && <path d={pathOf((p) => p.gpa)} fill="none" stroke={GPA_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {showCgpa && points.length > 1 && <path d={pathOf((p) => p.cgpa)} fill="none" stroke={CGPA_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => (
            <g key={p.semester}>
              <circle cx={x(i)} cy={y(p.gpa)} r={hover === i ? 6 : 4.5} fill={GPA_COLOR} stroke="white" strokeWidth={2} />
              {showCgpa && p.cgpa !== undefined && <circle cx={x(i)} cy={y(p.cgpa)} r={hover === i ? 6 : 4.5} fill={CGPA_COLOR} stroke="white" strokeWidth={2} />}
            </g>
          ))}
          {(labelEnds || !showCgpa) && (
            <text x={x(last) + 10} y={y(points[last].gpa)} dominantBaseline="middle" className="fill-slate-800 text-[12px] font-bold">{formatGpa(points[last].gpa)}</text>
          )}
          {showCgpa && labelEnds && points[last].cgpa !== undefined && (
            <text x={x(last) + 10} y={y(points[last].cgpa!)} dominantBaseline="middle" className="fill-slate-800 text-[12px] font-bold">{formatGpa(points[last].cgpa!)}</text>
          )}

          {/* Hit areas wider than the marks */}
          {points.map((p, i) => {
            const half = points.length === 1 ? plotW / 2 : plotW / (points.length - 1) / 2;
            return (
              <rect key={p.semester} x={x(i) - half} y={PAD.top} width={half * 2} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                onClick={() => onSelect?.(p.semester)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(p.semester); } }}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                aria-label={`Semester ${p.semester}: GPA ${formatGpa(p.gpa)}${p.cgpa !== undefined ? `, CGPA ${formatGpa(p.cgpa)}` : ''}`} />
            );
          })}
        </svg>
      )}

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(Math.max(hovered.gpa, hovered.cgpa ?? 0)) / H) * 100 + (showCgpa ? 8 : 0)}%`, marginTop: -10 }}
        >
          <p className="font-bold">Semester {hovered.semester}</p>
          <p>GPA {formatGpa(hovered.gpa)}{hovered.credits ? ` · ${hovered.credits} credits` : ''}</p>
          {hovered.cgpa !== undefined && <p>CGPA so far {formatGpa(hovered.cgpa)}</p>}
        </div>
      )}
    </figure>
  );
}
