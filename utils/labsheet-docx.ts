// Writes the department's Lab Mark Sheet as a Word document: one page per 13 students of each lab
// course, with the course header, the marks table (Experiment · CA [CT, AT] · Total) left blank for
// the examiners, and the internal/external examiner signature box on every page.
import { semesterTitle } from './rollsheet';

export type LabMarks = { experiment: number; ct: number; at: number };

export type LabCourse = {
  course_code: string;
  title: string;
  marks: LabMarks;
  internal: string; // examiner names, printed on the signature box (blank lines if empty)
  external: string;
  rolls: string[];
};

export type LabSheetOptions = {
  department: string; // "Department of Computer Science and Engineering, RU"
  semester: number;
  examYear: string;
  courses: LabCourse[];
  rowsPerPage: number;
  fillAttendance: boolean; // print full AT marks for every student
};

// A lab's 25 marks per credit split 70 / 20 / 10, as on the department's sheet (17.5 · 5 · 2.5).
export function defaultLabMarks(credit: number | null): LabMarks {
  const total = 25 * (credit && credit > 0 ? credit : 1);
  return { experiment: total * 0.7, ct: total * 0.2, at: total * 0.1 };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const FONT = 'Times New Roman';
const WIDTHS = [1830, 2030, 1340, 1630, 2196]; // twips: Roll · Experiment · CT · AT · Total = 9026 (A4 minus 1" margins)
const SIGN_WIDTHS = [1000, 3513, 1000, 3513];

export async function buildLabSheetDocx(opts: LabSheetOptions): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, HeightRule, Packer, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, VerticalMergeType, WidthType } = d;

  const run = (text: string, o: { bold?: boolean; size?: number; superScript?: boolean } = {}) =>
    new TextRun({ text, font: FONT, size: o.size ?? 24, bold: o.bold, superScript: o.superScript });

  // "2nd year 2nd Semester" with the ordinal suffixes raised, as typed on the sheet.
  const [yearPart, semPart] = semesterTitle(opts.semester).split(' Year ');
  const ordinal = (s: string) => [run(s.replace(/\D+$/, '')), run(s.replace(/^\d+/, ''), { superScript: true })];

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const line = { style: BorderStyle.SINGLE, size: 8, color: '000000' };

  const header = (course: LabCourse, first: boolean) => [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      pageBreakBefore: !first,
      border: { top: line, bottom: line },
      spacing: { before: 240, after: 60 },
      children: [run('Lab Mark Sheet', { bold: true, size: 32 })],
    }),
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
      children: [run(opts.department), run(`\tExam Year: ${opts.examYear}`)],
    }),
    new Paragraph({ children: [run('B.Sc. (Engg) '), ...ordinal(yearPart), run(' year '), ...ordinal(semPart.replace(' Semester', '')), run(' Semester')] }),
    new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 1700 }], children: [run('Course Code\t: '), run(course.course_code)] }),
    new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 1700 }], spacing: { after: 360 }, children: [run('Course Title\t: '), run(course.title)] }),
  ];

  const cell = (text: string, i: number, o: { bold?: boolean; merge?: 'restart' | 'continue'; span?: number; left?: boolean } = {}) =>
    new TableCell({
      width: { size: o.span ? WIDTHS[i] + WIDTHS[i + 1] : WIDTHS[i], type: WidthType.DXA },
      columnSpan: o.span,
      verticalMerge: o.merge === 'restart' ? VerticalMergeType.RESTART : o.merge === 'continue' ? VerticalMergeType.CONTINUE : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { left: 80, right: 80 },
      children: [new Paragraph({ alignment: o.left ? AlignmentType.LEFT : AlignmentType.CENTER, children: [run(text, { bold: o.bold })] })],
    });

  const marksTable = (course: LabCourse, rolls: string[]) => {
    const m = course.marks;
    const total = m.experiment + m.ct + m.at;
    const headRows = [
      new TableRow({
        height: { value: 560, rule: HeightRule.ATLEAST },
        children: [
          cell('Roll No', 0, { bold: true, merge: 'restart' }),
          cell(`Experiment (${fmt(m.experiment)})`, 1, { bold: true, merge: 'restart' }),
          cell(`CA (${fmt(m.ct + m.at)})`, 2, { bold: true, span: 2 }),
          cell(`Total (${fmt(total)})`, 4, { bold: true, merge: 'restart' }),
        ],
      }),
      new TableRow({
        height: { value: 440, rule: HeightRule.ATLEAST },
        children: [
          cell('', 0, { merge: 'continue' }),
          cell('', 1, { merge: 'continue' }),
          cell(`CT (${fmt(m.ct)})`, 2, { bold: true }),
          cell(`AT (${fmt(m.at)})`, 3, { bold: true }),
          cell('', 4, { merge: 'continue' }),
        ],
      }),
    ];
    const bodyRows = rolls.map((roll) => new TableRow({
      height: { value: 500, rule: HeightRule.EXACT },
      cantSplit: true,
      children: [
        cell(roll, 0),
        cell('', 1),
        cell('', 2),
        cell(opts.fillAttendance ? fmt(m.at) : '', 3),
        cell('', 4),
      ],
    }));
    return new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: WIDTHS,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: [...headRows, ...bodyRows],
    });
  };

  const signCell = (text: string, i: number, o: { bold?: boolean; span?: number } = {}) =>
    new TableCell({
      width: { size: o.span ? SIGN_WIDTHS[i] + SIGN_WIDTHS[i + 1] : SIGN_WIDTHS[i], type: WidthType.DXA },
      columnSpan: o.span,
      verticalAlign: VerticalAlign.BOTTOM,
      children: [new Paragraph({ children: [run(text, { bold: o.bold })] })],
    });
  const signatures = (course: LabCourse) => new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: SIGN_WIDTHS,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({ height: { value: 500, rule: HeightRule.ATLEAST }, children: [signCell('Internal', 0, { bold: true, span: 2 }), signCell('External', 2, { bold: true, span: 2 })] }),
      new TableRow({ height: { value: 520, rule: HeightRule.ATLEAST }, children: [signCell('Name', 0), signCell(course.internal || '……………………………', 1), signCell('Name', 2), signCell(course.external || '……………………………', 3)] }),
      new TableRow({ height: { value: 780, rule: HeightRule.ATLEAST }, children: [signCell('Signature', 0), signCell('……………………………', 1), signCell('Signature', 2), signCell('……………………………', 3)] }),
      new TableRow({ height: { value: 620, rule: HeightRule.ATLEAST }, children: [signCell('Date', 0), signCell('……………………………', 1), signCell('Date', 2), signCell('……………………………', 3)] }),
    ],
  });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  const perPage = Math.max(1, Math.floor(opts.rowsPerPage) || 13);
  // Each page starts with pageBreakBefore on its title, so no blank page is left at the end.
  opts.courses.forEach((course) => {
    const pages = course.rolls.length ? Math.ceil(course.rolls.length / perPage) : 1;
    for (let p = 0; p < pages; p++) {
      children.push(...header(course, children.length === 0));
      children.push(marksTable(course, course.rolls.slice(p * perPage, (p + 1) * perPage)));
      children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
      children.push(signatures(course));
    }
  });

  const doc = new Document({
    creator: 'CSE Department Portal',
    title: `Lab Mark Sheet — ${semesterTitle(opts.semester)} ${opts.examYear}`,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 567, bottom: 567, left: 1440, right: 1440, header: 360, footer: 360 } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
