// The Admit Card Distribution Sheet (Word, A4 portrait): the college letterhead on every page, the
// exam title, then everyone sitting the exam in three groups — Regular, Readd, and backlog
// (retake / improvement) students from later semesters — with a box for each student to sign
// when they collect their admit card. Same examinees as the roll sheet.
import { semesterTitle, sessionOf, type RollEntry } from './rollsheet';

const WORD_ORDINAL = ['First', 'Second', 'Third', 'Fourth'];

// RU course codes carry the year and semester (CSE2111 → year 2, semester 1). The exam's semester
// is read from its subjects' codes, falling back to the portal semester number.
function yearAndSemester(courseCode: string | undefined, fallbackSemester: number) {
  const digits = (courseCode ?? '').replace(/\D/g, '');
  const year = Number(digits[0]), sem = Number(digits[1]);
  if (year >= 1 && year <= 4 && (sem === 1 || sem === 2)) return { year, sem };
  return { year: Math.ceil(fallbackSemester / 2), sem: ((fallbackSemester - 1) % 2) + 1 };
}

// "Second Year First Semester Final Examination 2025"
export function admitExamLine(courseCode: string | undefined, fallbackSemester: number, examYear: string) {
  const { year, sem } = yearAndSemester(courseCode, fallbackSemester);
  return `${WORD_ORDINAL[year - 1]} Year ${WORD_ORDINAL[sem - 1]} Semester Final Examination ${examYear}`.trim();
}

// "2nd Year 1st Semester" for the page footer
export function admitShortSemester(courseCode: string | undefined, fallbackSemester: number) {
  const { year, sem } = yearAndSemester(courseCode, fallbackSemester);
  return semesterTitle((year - 1) * 2 + sem);
}

export type AdmitGroup = 'regular' | 'readd' | 'backlog';
export const ADMIT_GROUP_LABEL: Record<AdmitGroup, string> = { regular: 'Regular', readd: 'Readd', backlog: 'Backlog (retake / improvement)' };

export type AdmitRow = {
  group: AdmitGroup;
  roll: string;
  collegeId: string;
  name: string;
  session: string;
  note?: string; // under the name for backlog students: "Retake / improvement (now Sem 5)"
};

export function admitRowFromEntry(e: RollEntry): AdmitRow {
  const s = e.student;
  const roll = s.ru_id?.trim() ?? '';
  const collegeId = s.college_id?.trim() ?? '';
  return {
    group: e.group,
    roll,
    collegeId: collegeId === roll ? '' : collegeId,
    name: s.name?.trim() ?? '',
    session: sessionOf(s),
    note: e.group === 'backlog' ? `Retake / improvement${s.semester ? ` (now Sem ${s.semester})` : ''}` : undefined,
  };
}

export type AdmitSheetOptions = {
  degreeLine: string; // "B.Sc. in Computer Science & Engineering (CSE)"
  examLine: string; // "Second Year First Semester Final Examination 2025"
  footerLine: string; // "Admit card distribution — B.Sc. (CSE) 2nd Year 1st Semester Exam 2025"
  rows: AdmitRow[];
  logo?: ArrayBuffer; // defaults to /roll-sheet/ice-logo.png
};

const FONT = 'Arial';
const GREEN = '1F7A3A';
const WIDTH = 10204; // A4 width minus 0.6" margins, twips
const COLS = [620, 1480, 1160, 3420, 1074, 2450];

export async function buildAdmitSheetDocx(opts: AdmitSheetOptions): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, ImageRun, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType } = d;

  const logo: ArrayBuffer = opts.logo ?? (await fetch('/roll-sheet/ice-logo.png').then((r) => r.arrayBuffer()));
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, font: FONT, size: o.size ?? 20, bold: o.bold, color: o.color });
  const para = (text: string, o: { bold?: boolean; size?: number; color?: string; center?: boolean; before?: number; after?: number } = {}) =>
    new Paragraph({ alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { before: o.before ?? 0, after: o.after ?? 0 }, children: [run(text, o)] });

  const line = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

  const cell = (paras: InstanceType<typeof Paragraph>[], i: number, shade = false) => new TableCell({
    width: { size: COLS[i], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 100, right: 80 },
    shading: shade ? { fill: 'EEF3EE' } : undefined,
    children: paras,
  });
  const centered = (text: string, o: { bold?: boolean; size?: number } = {}) => [para(text, { ...o, center: true })];

  const headRow = () => new TableRow({
    tableHeader: true,
    height: { value: 500, rule: HeightRule.ATLEAST },
    children: [
      cell(centered('SL', { bold: true }), 0, true),
      cell(centered('Roll No.', { bold: true }), 1, true),
      cell(centered('College ID', { bold: true, size: 18 }), 2, true),
      cell([para('Name of the Student', { bold: true })], 3, true),
      cell(centered('Session', { bold: true }), 4, true),
      cell(centered('Signature & Date', { bold: true }), 5, true),
    ],
  });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    para(opts.degreeLine, { size: 22, center: true, before: 120 }),
    para(opts.examLine, { bold: true, size: 26, center: true, before: 20 }),
    para('Admit Card Distribution Sheet', { size: 21, center: true, before: 20, after: 280 }),
  ];

  let sl = 0;
  (['regular', 'readd', 'backlog'] as const).forEach((group) => {
    const rows = opts.rows.filter((r) => r.group === group);
    if (!rows.length) return;
    children.push(new Paragraph({
      keepNext: true,
      spacing: { before: sl ? 280 : 0, after: 80 },
      children: [run(`${ADMIT_GROUP_LABEL[group]} (${rows.length})`, { bold: true, size: 22, color: GREEN })],
    }));
    children.push(new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: COLS,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: [
        headRow(),
        ...rows.map((r) => {
          sl += 1;
          const name = [para(r.name)];
          if (r.note) name.push(para(r.note, { size: 16, color: '666666' }));
          return new TableRow({
            cantSplit: true,
            height: { value: 680, rule: HeightRule.ATLEAST },
            children: [
              cell(centered(`${sl}.`), 0),
              cell(centered(r.roll), 1),
              cell(centered(r.collegeId), 2),
              cell(name, 3),
              cell(centered(r.session), 4),
              cell([para('')], 5),
            ],
          });
        }),
      ],
    }));
  });

  children.push(para(`Total examinees: ${sl}`, { bold: true, size: 21, before: 240 }));

  // Two signature lines: who handed out the cards, and the Head of the department.
  const signCell = (label: string) => new TableCell({
    width: { size: WIDTH / 2, type: WidthType.DXA },
    borders: { top: none, bottom: none, left: none, right: none },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run('______________________________')] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [run(label)] }),
    ],
  });
  children.push(new Paragraph({ spacing: { before: 1000 }, keepNext: true, children: [] }));
  children.push(new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: [WIDTH / 2, WIDTH / 2],
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: [signCell('Distributed by (Name & Signature)'), signCell('Head, Department of CSE')] })],
  }));

  // ---------- letterhead (every page) ----------
  const letterhead = new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: [1300, 7104, 1800],
    borders: { top: none, bottom: { style: BorderStyle.SINGLE, size: 12, color: GREEN }, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 1300, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          margins: { bottom: 100 },
          children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 44, height: 61 } })] })],
        }),
        new TableCell({
          width: { size: 7104, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          margins: { bottom: 100 },
          children: [
            para('IMPERIAL COLLEGE OF ENGINEERING', { bold: true, size: 32, center: true }),
            para('Affiliated With University of Rajshahi  ·  Jessore Road Baikaly, Khulna-9000', { size: 18, center: true, before: 40 }),
            para('Department of Computer Science & Engineering', { size: 18, center: true, before: 20 }),
          ],
        }),
        new TableCell({
          width: { size: 1800, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run('Code No- 385', { bold: true, size: 18 })] })],
        }),
      ],
    })],
  });

  const doc = new Document({
    creator: 'CSE Department Portal',
    title: `Admit Card Distribution — ${opts.examLine}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 2050, bottom: 900, left: 851, right: 851, header: 500, footer: 360 },
        },
      },
      headers: { default: new Header({ children: [letterhead, new Paragraph({ children: [] })] }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: WIDTH }],
            children: [
              run(opts.footerLine, { size: 15, color: '777777' }),
              run('\tPage ', { size: 15, color: '777777' }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: '777777' }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
