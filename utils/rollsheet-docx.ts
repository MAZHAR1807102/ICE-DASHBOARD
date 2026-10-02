// Writes an RU roll sheet as a Word document in the department's layout:
// A4 portrait, college letterhead, title lines, and the examinee table
// (SL · Roll · Session · Names · Subject · Credit · Marks) with the header row repeated on every page.
import type { RollEntry, RollSubject } from './rollsheet';
import { sessionOf } from './rollsheet';

export type RollSheetOptions = {
  degreeLine: string; // "B.Sc. in Computer Science & Engineering (CSE)"
  examLine: string; // "1st Year 1st Semester Final Examination 2025"
  label: string; // "Regular"
  subjects: RollSubject[];
  entries: RollEntry[];
  marksPerCredit: number;
  useDitto: boolean; // ",," when a student's subjects are the same as the student above
  logo?: ArrayBuffer; // defaults to /roll-sheet/ice-logo.png
};

const FONT = 'Nirmala UI'; // has Bangla glyphs, as on the department's sheets
const WIDTHS = [430, 1085, 1000, 2850, 3580, 760, 761]; // twips, total = A4 width − margins (10466)

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export async function buildRollSheetDocx(opts: RollSheetOptions): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, VerticalMergeType, WidthType } = d;

  const logo: ArrayBuffer = opts.logo ?? (await fetch("/roll-sheet/ice-logo.png").then((r) => r.arrayBuffer()));
  const run = (text: string, o: { bold?: boolean; size?: number; italics?: boolean } = {}) =>
    new TextRun({ text, font: FONT, size: o.size ?? 18, bold: o.bold, italics: o.italics });
  const para = (text: string | InstanceType<typeof TextRun>[], o: { bold?: boolean; size?: number; center?: boolean; after?: number } = {}) =>
    new Paragraph({
      alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: o.after ?? 0, before: 0 },
      children: typeof text === 'string' ? [run(text, o)] : text,
    });

  const cell = (children: InstanceType<typeof Paragraph>[], i: number, o: { merge?: 'restart' | 'continue'; span?: number; center?: boolean; shade?: boolean } = {}) =>
    new TableCell({
      children,
      width: { size: o.span ? WIDTHS[i] + WIDTHS[i + 1] : WIDTHS[i], type: WidthType.DXA },
      columnSpan: o.span,
      verticalMerge: o.merge === 'restart' ? VerticalMergeType.RESTART : o.merge === 'continue' ? VerticalMergeType.CONTINUE : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 70, right: 70 },
      shading: o.shade ? { fill: 'F2F2F2' } : undefined,
    });

  const subjectsByCode = new Map(opts.subjects.map((s) => [s.course_code, s]));

  // ---------- header rows (repeated on every page) ----------
  const h = (text: string) => [para(text, { bold: true, center: true })];
  const headerRows = [
    new TableRow({
      tableHeader: true,
      children: [
        cell(h('SL No'), 0, { merge: 'restart', shade: true }),
        cell(h('Student Roll'), 1, { merge: 'restart', shade: true }),
        cell(h('Session'), 2, { merge: 'restart', shade: true }),
        cell(h('Name of the Examinees, Mother’s & Father’s Name'), 3, { merge: 'restart', shade: true }),
        cell(h('Name of the Subject'), 4, { merge: 'restart', shade: true }),
        cell(h('Mark Distribution (Theory)'), 5, { span: 2, shade: true }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: [
        cell([para('')], 0, { merge: 'continue', shade: true }),
        cell([para('')], 1, { merge: 'continue', shade: true }),
        cell([para('')], 2, { merge: 'continue', shade: true }),
        cell([para('')], 3, { merge: 'continue', shade: true }),
        cell([para('')], 4, { merge: 'continue', shade: true }),
        cell(h('Credit'), 5, { shade: true }),
        cell(h('Marks'), 6, { shade: true }),
      ],
    }),
  ];

  // ---------- one block of rows per student ----------
  const rows: InstanceType<typeof TableRow>[] = [...headerRows];
  let previous: string | null = null;
  opts.entries.forEach((entry, index) => {
    const s = entry.student;
    const ordered = [...entry.subjects].sort((a, b) => (subjectsByCode.get(a)?.position ?? 0) - (subjectsByCode.get(b)?.position ?? 0));
    const signature = ordered.join('|');
    const lines: { subject: string; credit: string; marks: string }[] =
      opts.useDitto && signature === previous
        ? [{ subject: ',,', credit: ',,', marks: ',,' }]
        : ordered.map((code) => {
            const sub = subjectsByCode.get(code);
            const theory = sub?.is_theory ?? true;
            const credit = sub?.credit ?? null;
            return {
              subject: sub?.title?.trim() ? `${code}: ${sub.title.trim()}` : code,
              credit: theory && credit ? fmt(credit) : '',
              marks: theory && credit ? fmt(credit * opts.marksPerCredit) : '',
            };
          });
    previous = signature;

    const names = [
      para([run('Name of Student: ', { bold: true }), run(s.name || '')]),
      para([run('Name (In Bangla): ', { bold: true }), run(s.name_bn || '')]),
      para([run('Mother’s Name: ', { bold: true }), run(s.mother_name || '')]),
      para([run('Father’s Name: ', { bold: true }), run(s.father_name || '')]),
    ];

    lines.forEach((line, i) => {
      const first = i === 0;
      const merge = lines.length > 1 ? (first ? 'restart' : 'continue') : undefined;
      rows.push(new TableRow({
        cantSplit: true,
        children: [
          cell(first ? [para(`${index + 1}.`, { center: true })] : [para('')], 0, { merge }),
          cell(first ? [para(s.ru_id ?? '', { center: true })] : [para('')], 1, { merge }),
          cell(first ? [para(sessionOf(s), { center: true })] : [para('')], 2, { merge }),
          cell(first ? names : [para('')], 3, { merge }),
          cell([para(line.subject, { center: line.subject === ',,' })], 4),
          cell([para(line.credit, { center: true })], 5),
          cell([para(line.marks, { center: true })], 6),
        ],
      }));
    });
  });

  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

  // ---------- letterhead ----------
  const letterhead = new Table({
    width: { size: 10466, type: WidthType.DXA },
    columnWidths: [1100, 7766, 1600],
    borders: { top: none, bottom: { style: BorderStyle.SINGLE, size: 12, color: '1F7A3A' }, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 1100, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 46, height: 64 } })] })],
        }),
        new TableCell({
          width: { size: 7766, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          children: [
            para('ইম্পেরিয়াল কলেজ অব ইঞ্জিনিয়ারিং', { bold: true, size: 26, center: true }),
            para('রাজশাহী বিশ্ববিদ্যালয় অধিভুক্ত কলেজ · যশোর রোড, বৈকালী, খুলনা-৯০০০।', { size: 18, center: true }),
            para('IMPERIAL COLLEGE OF ENGINEERING', { bold: true, size: 28, center: true }),
            para('Affiliated With University of Rajshahi · Jessore Road Baikaly, Khulna-9000.', { size: 18, center: true }),
          ],
        }),
        new TableCell({
          width: { size: 1600, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run('Code No- 385', { bold: true, size: 18 })] })],
        }),
      ],
    })],
  });

  const doc = new Document({
    creator: 'CSE Department Portal',
    title: `Roll Sheet — ${opts.examLine}`,
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 2050, bottom: 700, left: 720, right: 720, header: 300, footer: 288 },
        },
      },
      headers: { default: new Header({ children: [letterhead] }) },
      footers: {
        default: new Footer({
          children: [para('Web: www.imperial.edu.bd   email: icekhulna@gmail.com   Phone: 041-763509, Cell: 01711383995', { size: 16, center: true })],
        }),
      },
      children: [
        para(opts.degreeLine, { bold: true, size: 22, center: true }),
        para(opts.examLine, { bold: true, size: 22, center: true }),
        para(`Roll Sheet (${opts.label})`, { bold: true, size: 22, center: true, after: 160 }),
        new Table({
          width: { size: 10466, type: WidthType.DXA },
          columnWidths: WIDTHS,
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows,
        }),
      ],
    }],
  });

  return Packer.toBlob(doc);
}
