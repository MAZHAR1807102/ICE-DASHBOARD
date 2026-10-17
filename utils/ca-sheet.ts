// The department's CA (continuous assessment) Mark Sheet for theory courses: every student's class
// tests, CT average, attendance marks and CA total, worked out from the CT marks teachers enter in
// the portal and the course attendance recorded by the academic office.
import { ctCount, ctMax } from './ct';

// Full marks are 25 per credit: 10% attendance, 20% class tests, 70% theory exam (two sections).
export const caMarks = (credit: number) => {
  const full = 25 * credit;
  return { full, section: full * 0.35, attendance: full * 0.1, ct: full * 0.2, theory: full * 0.7 };
};

export type AttendanceRule = { mode: 'bands' | 'full' | 'blank'; bands: { min: number; share: number }[] };

// Attendance % → share of the attendance marks. Editable in the CA sheet window.
export const DEFAULT_BANDS = [
  { min: 90, share: 100 }, { min: 85, share: 90 }, { min: 80, share: 80 }, { min: 75, share: 70 },
  { min: 70, share: 60 }, { min: 65, share: 50 }, { min: 60, share: 40 },
];

export type CaInput = { roll: string; cts: (number | null)[]; attendancePercent: number | null };
export type CaRow = { roll: string; cts: (number | null)[]; ctAverage: number | null; attendance: number | null; total: number | null };

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
export const fmt = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100));

export function caRow(input: CaInput, credit: number, rule: AttendanceRule): CaRow {
  const m = caMarks(credit);
  const entered = input.cts.filter((c): c is number => c !== null);
  // Average over the course's CTs (a CT not taken counts as 0), rounded to the nearest 0.5 as on the sheet.
  const ctAverage = entered.length ? roundTo(input.cts.reduce<number>((s, c) => s + (c ?? 0), 0) / input.cts.length, 0.5) : null;
  let attendance: number | null = null;
  if (rule.mode === 'full') attendance = m.attendance;
  else if (rule.mode === 'bands' && input.attendancePercent !== null) {
    const band = [...rule.bands].sort((a, b) => b.min - a.min).find((b) => input.attendancePercent! >= b.min);
    attendance = roundTo(m.attendance * (band ? band.share : 0) / 100, 0.25);
  }
  // No total until the CTs are in, so a half-filled row never looks like a final CA mark.
  const total = ctAverage === null ? null : ctAverage + (attendance ?? 0);
  return { roll: input.roll, cts: input.cts, ctAverage, attendance, total };
}

const ORDINAL_WORD = ['First', 'Second', 'Third', 'Fourth'];
// RU course codes carry the year and semester: CSE2111 → "Second Year First Semester".
export function yearSemesterLine(courseCode: string, fallbackSemester: number) {
  const digits = courseCode.replace(/\D/g, '');
  const year = Number(digits[0]), sem = Number(digits[1]);
  if (year >= 1 && year <= 4 && (sem === 1 || sem === 2)) return `${ORDINAL_WORD[year - 1]} Year ${ORDINAL_WORD[sem - 1]} Semester`;
  return `${ORDINAL_WORD[Math.ceil(fallbackSemester / 2) - 1]} Year ${ORDINAL_WORD[(fallbackSemester - 1) % 2]} Semester`;
}

export type CaCourse = { course_code: string; title: string; credit: number; semester: number; rows: CaRow[]; teacher?: string };
export type CaSheetOptions = { department: string; examYear: string; courses: CaCourse[]; rowsPerPage?: number; date?: string };

const FONT = 'Times New Roman';

export async function buildCaSheetDocx(opts: CaSheetOptions): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, HeightRule, Packer, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType } = d;
  const run = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 22, bold: o.bold });
  const line = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const WIDTH = 9026;

  const cell = (text: string, width: number, o: { bold?: boolean; size?: number } = {}) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { left: 60, right: 60 },
    children: text.split('\n').map((t) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(t, { bold: o.bold, size: o.size ?? 20 })] })),
  });

  // Like the department's sheet, every page carries the full course heading and its own signature
  // line, so a course with more students than fit on a page is split into parts.
  const perPage = Math.max(1, opts.rowsPerPage ?? 18);
  const parts = opts.courses.flatMap((course) => {
    const chunks = [];
    for (let i = 0; i < Math.max(1, course.rows.length); i += perPage) chunks.push({ ...course, rows: course.rows.slice(i, i + perPage) });
    return chunks;
  });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  parts.forEach((course, index) => {
    const m = caMarks(course.credit);
    const n = ctCount({ credit: course.credit });
    const max = ctMax({ credit: course.credit });
    const right = [{ type: TabStopType.RIGHT, position: WIDTH }];

    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore: index > 0, border: { bottom: line }, children: [run('Mark Sheet', { bold: true, size: 24 })] }),
      new Paragraph({ children: [run(`${opts.department} Exam Year: ${opts.examYear}`)] }),
      new Paragraph({ children: [run(`B.Sc. Engg. ${yearSemesterLine(course.course_code, course.semester)}`)] }),
      new Paragraph({ tabStops: right, children: [run(`Course Code: ${course.course_code}`), run(`\tNo. of Class Test: ${String(n).padStart(2, '0')}`)] }),
      new Paragraph({ tabStops: right, spacing: { after: 200 }, children: [run(`Course Title: ${course.title}`), run(`\tCredits: ${course.credit.toFixed(1)}`)] }),
    );

    // Marks distribution for 4, 3 and 2 credit courses; this course's row in bold.
    const dw = [1806, 1805, 1805, 1805, 1805];
    children.push(new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: dw,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: [
        new TableRow({ children: ['Full Marks', 'Marks in Each\nSection', 'Attendance', 'Class Test', 'Theory'].map((t, i) => cell(t, dw[i])) }),
        ...[4, 3, 2].map((cr) => {
          const x = caMarks(cr);
          return new TableRow({ children: [x.full, x.section, x.attendance, x.ct, x.theory].map((v, i) => cell(fmt(v), dw[i], { bold: cr === course.credit })) });
        }),
      ],
    }));
    children.push(new Paragraph({ spacing: { after: 280 }, children: [] }));

    // Students: Roll · Theory (blank) · CT-1…n · CT (avg) · Attendance · Total
    const ctW = n === 4 ? 920 : 1080;
    const widths = [1700, 1000, ...Array(n).fill(ctW), 1060, 1100];
    widths.push(WIDTH - widths.reduce((a, b) => a + b, 0));
    const head = ['Roll No', 'Theory', ...Array.from({ length: n }, (_, i) => `CT - ${i + 1}\n(${fmt(max)})`), `CT (avg)\n(${fmt(m.ct)})`, `Attendance\n(${fmt(m.attendance)})`, `Total\n(${fmt(m.ct + m.attendance)})`];
    children.push(new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: [
        new TableRow({ tableHeader: true, height: { value: 560, rule: HeightRule.ATLEAST }, children: head.map((t, i) => cell(t, widths[i])) }),
        ...course.rows.map((r) => new TableRow({
          cantSplit: true,
          height: { value: 440, rule: HeightRule.ATLEAST },
          children: [r.roll, '', ...Array.from({ length: n }, (_, i) => fmt(r.cts[i] ?? null)), fmt(r.ctAverage), fmt(r.attendance), fmt(r.total)].map((t, i) => cell(t, widths[i])),
        })),
      ],
    }));

    // Name (the course teacher, from the course list) · Signature · Date under a signature line.
    children.push(new Paragraph({ spacing: { before: 900 }, children: [] }));
    children.push(new Paragraph({
      tabStops: [{ type: TabStopType.CENTER, position: WIDTH / 2 }, { type: TabStopType.RIGHT, position: WIDTH - 400 }],
      border: { top: none, bottom: line },
      spacing: { after: 120 },
      children: [run(course.teacher?.trim() ? `Name: ${course.teacher.trim()}` : 'Name'), run('\tSignature'), run(opts.date ? `\tDate: ${opts.date}` : '\tDate')],
    }));
  });

  const doc = new Document({
    creator: 'CSE Department Portal',
    title: `CA Mark Sheet ${opts.examYear}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 900, left: 1440, right: 1440 } } }, children }],
  });
  return Packer.toBlob(doc);
}
