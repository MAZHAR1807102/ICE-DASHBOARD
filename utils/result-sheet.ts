// Reads RU-style tabulation sheets: one row per student (keyed by Roll / RU ID), one column per
// course holding the letter grade, then optional EC, GPA, YEC, YGPA, Result and Merit columns.
// Works from a plain grid of cells (CSV / Excel) or from positioned PDF text (see pdfPagesToGrid).

import { GRADES, GRADE_POINTS } from './grades';

export type Grid = { title: string; rows: string[][] };

export type SheetStudent = {
  roll: string;
  name?: string;
  grades: Record<string, string>; // course code -> letter grade ('' = not taken / absent)
  ec?: number;
  gpa?: number;
  yec?: number;
  ygpa?: number;
  result?: string;
  merit?: number;
};

export type ParsedSheet = {
  title: string;
  semesterGuess: number | null;
  courses: string[];
  students: SheetStudent[];
  hasOfficialFigures: boolean;
  problems: string[];
};

const COURSE = /[A-Z]{2,5}\s?\d{4}/g;
const isCourse = (s: string) => /^[A-Z]{2,5}\s?\d{4}$/.test(s.trim());
const ROLL = /^\d{10}$/;
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (s?: string) => {
  const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
  return s && s.trim() !== '' && !Number.isNaN(n) ? n : undefined;
};

// Header words we understand, mapped to a field.
const HEADER_KEYS: [RegExp, string][] = [
  [/^(roll|roll no\.?|student id|id|ru id|reg(istration)? no\.?)$/i, 'roll'],
  [/^(name|student name)$/i, 'name'],
  [/^ec$/i, 'ec'],
  [/^gpa$/i, 'gpa'],
  [/^yec$/i, 'yec'],
  [/^ygpa$/i, 'ygpa'],
  [/^(result|status)$/i, 'result'],
  [/^merit$/i, 'merit'],
];
const headerKey = (cell: string) => (isCourse(cell) ? cell.replace(/\s/g, '') : HEADER_KEYS.find(([re]) => re.test(cell))?.[1]);

const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '1': 1, '2': 2, '3': 3, '4': 4 };

// "B. Sc. (Engg.) 2nd Year 2nd Semester" → 4; falls back to the course codes (CSE2211 → year 2, semester 2).
export function detectSemester(title: string, courses: string[]): number | null {
  const m = title.toLowerCase().match(/(first|second|third|fourth|[1-4](?:st|nd|rd|th)?)\s*year\s*(first|second|[1-2](?:st|nd|rd|th)?)\s*semester/);
  if (m) {
    const year = ORDINAL[m[1]] ?? ORDINAL[m[1].replace(/\D/g, '')];
    const sem = ORDINAL[m[2]] ?? ORDINAL[m[2].replace(/\D/g, '')];
    if (year && sem) return (year - 1) * 2 + sem;
  }
  const votes = new Map<number, number>();
  courses.forEach((c) => {
    const digits = c.replace(/\D/g, '');
    const year = Number(digits[0]), sem = Number(digits[1]);
    if (year >= 1 && year <= 4 && sem >= 1 && sem <= 2) {
      const s = (year - 1) * 2 + sem;
      votes.set(s, (votes.get(s) ?? 0) + 1);
    }
  });
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

export function parseResultSheet({ title, rows }: Grid): ParsedSheet {
  const grid = rows.map((r) => r.map(norm));
  const problems: string[] = [];

  // The header row has the course codes; a second header row may carry EC / GPA / YEC / YGPA.
  const headerIndex = grid.findIndex((r) => r.filter(isCourse).length >= 2);
  if (headerIndex === -1) {
    return { title, semesterGuess: null, courses: [], students: [], hasOfficialFigures: false, problems: ['No course codes (like CSE2211) were found in the header. Is this a result sheet?'] };
  }

  const columns = new Map<string, number>();
  for (const rowIndex of [headerIndex, headerIndex + 1, headerIndex - 1]) {
    const row = grid[rowIndex];
    if (!row || row.some((c) => ROLL.test(c))) continue;
    row.forEach((cell, col) => {
      const key = headerKey(cell);
      // The lower header row wins for EC/GPA/YEC/YGPA (it sits directly above the numbers).
      if (key && (!columns.has(key) || (rowIndex === headerIndex + 1 && ['ec', 'gpa', 'yec', 'ygpa'].includes(key)))) columns.set(key, col);
    });
  }
  const courses = [...columns.keys()].filter(isCourse).sort((a, b) => columns.get(a)! - columns.get(b)!);

  // Roll column: labelled, or else the column holding 10-digit numbers.
  if (!columns.has('roll')) {
    const sample = grid.slice(headerIndex + 1).find((r) => r.some((c) => ROLL.test(c)));
    const col = sample?.findIndex((c) => ROLL.test(c)) ?? -1;
    if (col >= 0) columns.set('roll', col);
  }
  const rollCol = columns.get('roll');
  if (rollCol === undefined) problems.push('Could not find the Roll / RU ID column.');

  const at = (row: string[], key: string) => (columns.has(key) ? row[columns.get(key)!] ?? '' : undefined);
  const students: SheetStudent[] = [];
  grid.slice(headerIndex + 1).forEach((row) => {
    const roll = rollCol !== undefined ? row[rollCol] : '';
    if (!ROLL.test(roll ?? '')) return;
    const grades: Record<string, string> = {};
    courses.forEach((code) => {
      const g = (at(row, code) ?? '').toUpperCase().replace(/\s/g, '');
      if (g && !GRADES.includes(g)) problems.push(`Roll ${roll}: "${g}" in ${code} is not a letter grade — left out.`);
      grades[code] = GRADES.includes(g) ? g : '';
    });
    students.push({
      roll,
      name: at(row, 'name') || undefined,
      grades,
      ec: num(at(row, 'ec')),
      gpa: num(at(row, 'gpa')),
      yec: num(at(row, 'yec')),
      ygpa: num(at(row, 'ygpa')),
      result: at(row, 'result') || undefined,
      merit: num(at(row, 'merit')),
    });
  });

  if (students.length === 0) problems.push('No student rows (10-digit Roll numbers) were found under the header.');

  return {
    title,
    semesterGuess: detectSemester(title, courses),
    courses,
    students,
    hasOfficialFigures: ['ec', 'gpa', 'ygpa', 'result'].some((k) => columns.has(k)),
    problems,
  };
}

// ---------- PDF: positioned text → grid ----------

export type PdfItem = { str: string; x: number; y: number; w: number };

// Groups text into lines, finds the header line(s) on each page, and snaps every cell of a student
// line to the nearest header column — so blank cells (absent students) stay blank instead of shifting.
export function pdfPagesToGrid(pages: PdfItem[][]): Grid {
  const titleParts: string[] = [];
  let header: string[] | null = null;
  const dataRows: string[][] = [];

  for (const items of pages) {
    const lines: { y: number; items: PdfItem[] }[] = [];
    items
      .filter((it) => it.str.trim())
      .forEach((it) => {
        const line = lines.find((l) => Math.abs(l.y - it.y) < 3);
        if (line) line.items.push(it);
        else lines.push({ y: it.y, items: [it] });
      });
    lines.sort((a, b) => b.y - a.y); // top of page first
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));

    const headerAt = lines.findIndex((l) => l.items.reduce((n, it) => n + (it.str.match(COURSE)?.length ?? 0), 0) >= 2);
    if (headerAt === -1) continue;
    if (!header) lines.slice(0, headerAt).forEach((l) => titleParts.push(l.items.map((i) => i.str).join(' ')));

    // Column anchors from the header line and the lines just below/above it.
    const anchors = new Map<string, number>();
    const headerY = lines[headerAt].y;
    lines
      .filter((l) => Math.abs(l.y - headerY) <= 30 && !l.items.some((it) => ROLL.test(it.str.trim())))
      .sort((a, b) => b.y - a.y)
      .forEach((l) => {
        const lower = l.y < headerY;
        l.items.forEach((it) => {
          const codes = it.str.match(COURSE);
          if (codes && codes.length > 1) {
            // "MATH2231MATH2241" in one text run: split it, spreading the width evenly.
            const step = it.w / codes.length;
            codes.forEach((c, i) => anchors.set(c.replace(/\s/g, ''), it.x + step * i + step / 2));
            return;
          }
          const key = headerKey(it.str.trim());
          if (key && (!anchors.has(key) || (lower && ['ec', 'gpa', 'yec', 'ygpa'].includes(key)))) anchors.set(key, it.x + it.w / 2);
        });
      });

    const keys = [...anchors.keys()].sort((a, b) => anchors.get(a)! - anchors.get(b)!);
    if (!header) header = keys;
    const xs = keys.map((k) => anchors.get(k)!);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    const tolerance = Math.max(12, Math.min(...gaps, 60) * 0.75);

    lines.slice(headerAt + 1).forEach((l) => {
      const rollItem = l.items.find((it) => ROLL.test(it.str.trim()));
      if (!rollItem) return;
      const cells: Record<string, string> = {};
      l.items.forEach((it) => {
        const centre = it === rollItem && anchors.has('roll') ? anchors.get('roll')! : it.x + it.w / 2;
        let best: string | null = null, bestDist = Infinity;
        keys.forEach((k) => { const d = Math.abs(anchors.get(k)! - centre); if (d < bestDist) { best = k; bestDist = d; } });
        if (best && bestDist <= tolerance) cells[best] = cells[best] ? `${cells[best]} ${it.str.trim()}` : it.str.trim();
      });
      if (!cells.roll) cells.roll = rollItem.str.trim();
      dataRows.push(header!.map((k) => cells[k] ?? ''));
    });
  }

  if (!header) return { title: titleParts.join(' '), rows: [] };
  // A synthetic header row the grid parser understands (course codes + field names).
  const headerRow = header.map((k) => ({ roll: 'Roll', name: 'Name', ec: 'EC', gpa: 'GPA', yec: 'YEC', ygpa: 'YGPA', result: 'Result', merit: 'Merit' })[k] ?? k);
  return { title: titleParts.join(' '), rows: [headerRow, ...dataRows] };
}

// Suggests credits from the EC column: a student who failed exactly one course earned
// (full load − that course's credit). The full load is the most common EC among students with no F.
export function inferCredits(sheet: ParsedSheet): Record<string, number> {
  const fullLoads = sheet.students
    .filter((s) => s.ec !== undefined && sheet.courses.every((c) => s.grades[c] && s.grades[c] !== 'F'))
    .map((s) => s.ec!);
  if (fullLoads.length === 0) return {};
  const counts = new Map<number, number>();
  fullLoads.forEach((ec) => counts.set(ec, (counts.get(ec) ?? 0) + 1));
  const full = [...counts].sort((a, b) => b[1] - a[1])[0][0];

  const guesses = new Map<string, number[]>();
  sheet.students.forEach((s) => {
    if (s.ec === undefined) return;
    const failed = sheet.courses.filter((c) => s.grades[c] === 'F');
    const taken = sheet.courses.filter((c) => s.grades[c]);
    if (failed.length === 1 && taken.length === sheet.courses.length) {
      guesses.set(failed[0], [...(guesses.get(failed[0]) ?? []), Math.round((full - s.ec) * 100) / 100]);
    }
  });
  return Object.fromEntries([...guesses].map(([code, values]) => [code, values.sort((a, b) => values.filter((v) => v === b).length - values.filter((v) => v === a).length)[0]]));
}

// Works out every course's credit from the printed GPAs (RU counts an F as 0.00):
// for each student, sum(gradePoint × credit) = GPA × sum(credit). Solved by least squares with the
// full load fixed, rounded to quarter credits, then checked against every printed GPA.
export function solveCreditsFromGpa(sheet: ParsedSheet): { credits: Record<string, number>; reproduced: number; checked: number } | null {
  const courses = sheet.courses;
  const n = courses.length;
  const complete = sheet.students.filter((s) => s.gpa !== undefined && s.gpa > 0 && courses.every((c) => s.grades[c]));
  const fullLoads = complete.map((s) => s.ec).filter((ec): ec is number => ec !== undefined && ec > 0);
  const load = fullLoads.length ? Math.max(...fullLoads) : undefined;
  if (!load || complete.length < n) return null;

  const rows: number[][] = complete.map((s) => courses.map((c) => GRADE_POINTS[s.grades[c]] - s.gpa!));
  const rhs: number[] = complete.map(() => 0);
  rows.push(courses.map(() => 50)); // anchor: credits add up to the full load
  rhs.push(50 * load);

  // Normal equations + Gauss-Jordan elimination.
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  const b = Array(n).fill(0);
  rows.forEach((row, i) => row.forEach((v, j) => { b[j] += v * rhs[i]; row.forEach((w, k) => (A[j][k] += v * w)); }));
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-9) return null;
    for (let r = 0; r < n; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let k = i; k < n; k++) A[r][k] -= f * A[i][k]; b[r] -= f * b[i]; }
  }
  const credits = Object.fromEntries(courses.map((c, i) => [c, Math.round((b[i] / A[i][i]) * 4) / 4]));
  if (Object.values(credits).some((cr) => cr <= 0)) return null;

  const withGpa = sheet.students.filter((s) => s.gpa !== undefined && courses.some((c) => s.grades[c]));
  const reproduced = withGpa.filter((s) => {
    const taken = courses.filter((c) => s.grades[c]);
    const total = taken.reduce((sum, c) => sum + credits[c], 0);
    const gpa = taken.reduce((sum, c) => sum + GRADE_POINTS[s.grades[c]] * credits[c], 0) / total;
    return Math.abs(gpa - s.gpa!) < 0.0015;
  }).length;
  return { credits, reproduced, checked: withGpa.length };
}

