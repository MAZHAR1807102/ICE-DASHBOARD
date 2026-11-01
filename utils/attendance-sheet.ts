// The department's Student Attendance Sheet (Word, A4 landscape): one sheet per course, with the
// course details on top, the students (No. · Name · ID/Roll), blank boxes for each class day,
// P · A · % columns, the marking key and a Day/Date row for writing the class dates.
// Matches the department's own sheet, which is set in Cambria.

export type AttendanceStudent = { name: string; roll: string };

export type AttendanceCourse = {
  course_code: string;
  title: string;
  instructor: string;
  semesterLine: string; // "Second Year 1st Semester"
  students: AttendanceStudent[];
};

export type AttendanceSheetOptions = {
  batch: string; // Section/Batch, e.g. "2023-24"
  academicYear: string; // e.g. "2025"
  days: number; // class-day columns (20 on the department's sheet)
  rowsPerPage: number; // students per page; a longer list continues on another page
  courses: AttendanceCourse[];
};

const WORD_ORDINAL = ['First', 'Second', 'Third', 'Fourth'];
const ORDINAL = ['1st', '2nd'];

// RU course codes carry the year and semester: CSE2111 → "Second Year 1st Semester" (the wording
// on the department's sheet). Falls back to the portal semester when the code doesn't say.
export function attendanceSemesterLine(courseCode: string, fallbackSemester: number) {
  const digits = courseCode.replace(/\D/g, '');
  let year = Number(digits[0]), sem = Number(digits[1]);
  if (!(year >= 1 && year <= 4 && (sem === 1 || sem === 2))) {
    year = Math.ceil(fallbackSemester / 2);
    sem = ((fallbackSemester - 1) % 2) + 1;
  }
  return `${WORD_ORDINAL[year - 1]} Year ${ORDINAL[sem - 1]} Semester`;
}

const FONT = 'Cambria';
const PAGE_W = 16838; // A4 landscape, twips
const PAGE_H = 11906;
const MARGIN_X = 400;
const WIDTH = PAGE_W - 2 * MARGIN_X; // 16038

export const DEFAULT_DAYS = 20;
export const DEFAULT_ROWS_PER_PAGE = 26;

export async function buildAttendanceSheetDocx(opts: AttendanceSheetOptions): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, HeightRule, PageOrientation, Packer, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } = d;

  const days = Math.min(31, Math.max(1, Math.floor(opts.days) || DEFAULT_DAYS));
  const perPage = Math.max(1, Math.floor(opts.rowsPerPage) || DEFAULT_ROWS_PER_PAGE);

  const run = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 18, bold: o.bold });
  const line = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const borders = { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line };

  const cell = (text: string, width: number, o: { bold?: boolean; size?: number; left?: boolean } = {}) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { left: 70, right: 50, top: 0, bottom: 0 },
    children: [new Paragraph({ alignment: o.left ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [run(text, o)] })],
  });

  // Students table: No. · Student Name · ID / Roll · one box per class day · P · A · %
  const fixed = [520, 1900, 1100];
  const boxW = Math.floor((WIDTH - fixed.reduce((a, b) => a + b, 0)) / (days + 3));
  const widths = [...fixed, ...Array(days + 3).fill(boxW)];
  widths[1] += WIDTH - widths.reduce((a, b) => a + b, 0); // rounding goes to the name column
  // Long names get a smaller size so they stay on one line, as on the department's sheet.
  const nameSize = (name: string) => (name.length > 24 ? 14 : name.length > 18 ? 16 : 18);

  // Course details: three label/value pairs on two rows.
  const infoW = Math.floor(WIDTH / 6);
  const infoWidths = [infoW, infoW, infoW, infoW, infoW, WIDTH - infoW * 5];

  // Day / Date row for writing the date of each class.
  const dayLabelW = 760;
  const dayW = Math.floor((WIDTH - dayLabelW) / days);
  const dayWidths = [dayLabelW, ...Array(days).fill(dayW)];
  dayWidths[days] += WIDTH - dayWidths.reduce((a, b) => a + b, 0);

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  opts.courses.forEach((course) => {
    const total = course.students.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    for (let p = 0; p < pages; p++) {
      const slice = course.students.slice(p * perPage, (p + 1) * perPage);

      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        pageBreakBefore: children.length > 0,
        spacing: { before: 0, after: 160 },
        children: [run('STUDENT ATTENDANCE SHEET', { bold: true, size: 36 })],
      }));

      const info = (cells: [string, string][]) => new TableRow({
        height: { value: 250, rule: HeightRule.ATLEAST },
        children: cells.flatMap(([label, value], i) => [cell(label, infoWidths[i * 2], { bold: true }), cell(value, infoWidths[i * 2 + 1])]),
      });
      children.push(new Table({
        width: { size: WIDTH, type: WidthType.DXA },
        columnWidths: infoWidths,
        borders,
        rows: [
          info([['Course/Subject', course.title], ['Instructor', course.instructor], ['Section/Batch', opts.batch]]),
          info([['Semester', course.semesterLine], ['Academic Year', opts.academicYear], ['Total Students', String(total)]]),
        ],
      }));
      children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [run('', { size: 14 })] }));

      const head = ['No.', 'Student Name', 'ID / Roll', ...Array(days).fill(''), 'P', 'A', '%'];
      children.push(new Table({
        width: { size: WIDTH, type: WidthType.DXA },
        columnWidths: widths,
        borders,
        rows: [
          new TableRow({
            tableHeader: true,
            height: { value: 370, rule: HeightRule.EXACT },
            children: head.map((t, i) => cell(t, widths[i], { bold: true, left: i === 1 })),
          }),
          ...slice.map((s, i) => new TableRow({
            cantSplit: true,
            height: { value: 285, rule: HeightRule.EXACT },
            children: [
              cell(String(p * perPage + i + 1), widths[0]),
              cell(s.name, widths[1], { left: true, size: nameSize(s.name) }),
              cell(s.roll, widths[2]),
              ...Array.from({ length: days + 3 }, (_, j) => cell('', widths[3 + j])),
            ],
          })),
        ],
      }));

      children.push(new Paragraph({
        spacing: { before: 20, after: 220 },
        children: [run('Marking:  P = Present   A = Absent   L = Late   E = Excused', { bold: true, size: 19 })],
      }));

      children.push(new Table({
        width: { size: WIDTH, type: WidthType.DXA },
        columnWidths: dayWidths,
        borders,
        rows: [
          new TableRow({ height: { value: 300, rule: HeightRule.EXACT }, children: [cell('Day', dayWidths[0], { bold: true, size: 16 }), ...Array.from({ length: days }, (_, j) => cell(String(j + 1), dayWidths[j + 1], { size: 16 }))] }),
          new TableRow({ height: { value: 300, rule: HeightRule.EXACT }, children: [cell('Date', dayWidths[0], { bold: true, size: 16 }), ...Array.from({ length: days }, (_, j) => cell('', dayWidths[j + 1]))] }),
        ],
      }));

      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 0 },
        children: [run(`${days}-Day Attendance Record — ${total} Student${total === 1 ? '' : 's'}${pages > 1 ? ` (page ${p + 1} of ${pages})` : ''}`, { size: 16 })],
      }));
    }
  });

  const doc = new Document({
    creator: 'CSE Department Portal',
    title: 'Student Attendance Sheet',
    styles: { default: { document: { run: { font: FONT, size: 18 }, paragraph: { spacing: { before: 0, after: 0 } } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 560, bottom: 400, left: MARGIN_X, right: MARGIN_X, header: 300, footer: 300 },
        },
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
