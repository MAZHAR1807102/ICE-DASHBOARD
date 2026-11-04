// The department's exam top sheet ("top page") as a Word document: one page per bundle (Lab Mark or
// Continuous Assessment) with two copies — the upper one from the college to the exam Chairman, the
// lower one to the Exam Controller — each naming the exam and listing the bundle's course codes.

export type TopSheetPage = { semester: number; kind: 'lab' | 'ca'; codes: string[] };
export type TopSheetOptions = {
  examYear: string;
  department: string; // "Computer Science and Engineering"
  chairman: string;
  from: string[]; // lines after "From,"
  controller: string[]; // lines after "To," on the lower copy
  pages: TopSheetPage[];
};

const ORDINAL = ['1st', '2nd', '3rd', '4th'];
const WORD = ['First', 'Second', 'Third', 'Fourth'];
export const yearOf = (semester: number) => Math.ceil(semester / 2);
export const parityOf = (semester: number) => (semester % 2 === 1 ? 'Odd' : 'Even');
// "Third Year Even Semester Exam 2024" — the exam named in the Chairman's address.
export const examTitle = (semester: number, examYear: string) => `${WORD[yearOf(semester) - 1]} Year ${parityOf(semester)} Semester Exam ${examYear}`;
export const KIND_TITLE = { lab: 'Lab Mark', ca: 'Continuous Assessment (CA)' } as const;

// RU course codes carry the year and semester (CSE3221 → 3rd year, 2nd semester → semester 6);
// odd last digit = theory (CA bundle), even = lab.
export function codeSemester(code: string) {
  const d = code.replace(/\D/g, '');
  const year = Number(d[0]), sem = Number(d[1]);
  return year >= 1 && year <= 4 && (sem === 1 || sem === 2) ? (year - 1) * 2 + sem : null;
}
export const codeKind = (code: string): 'lab' | 'ca' => (Number(code.replace(/\D/g, '').slice(-1)) % 2 === 1 ? 'ca' : 'lab');

const FONT = 'Times New Roman';

export async function buildTopSheetDocx(opts: TopSheetOptions): Promise<Blob> {
  const d = await import('docx');
  const { BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, WidthType } = d;

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const run = (text: string, o: { bold?: boolean; size?: number; sup?: boolean } = {}) =>
    new TextRun({ text, font: FONT, size: o.size ?? 24, bold: o.bold, superScript: o.sup });
  const para = (children: InstanceType<typeof TextRun>[], o: { before?: number; tabs?: boolean } = {}) =>
    new Paragraph({ spacing: { before: o.before ?? 0, after: 0 }, tabStops: o.tabs ? [{ type: TabStopType.LEFT, position: 2000 }] : undefined, children });
  const LEFT = 5100, RIGHT = 4646; // twips; 9746 = A4 minus 0.75" side margins
  const cell = (width: number, children: InstanceType<typeof Paragraph>[]) =>
    new TableCell({ width: { size: width, type: WidthType.DXA }, borders: noBorders, margins: { left: 60, right: 60 }, children });

  const copy = (page: TopSheetPage, to: string[]) => {
    const y = yearOf(page.semester);
    const heading = [
      para([run(`B.Sc. Engineering ${ORDINAL[y - 1].replace(/\D+$/, '')}`, { size: 28 }), run(ORDINAL[y - 1].replace(/^\d+/, ''), { size: 28, sup: true }), run(` Year ${parityOf(page.semester)} Semester`, { size: 28 })]),
      para([run(`Examination ${opts.examYear}`, { size: 28 })]),
      para([run('Department of ', { size: 28 }), run(opts.department, { size: 28, bold: true })]),
    ];
    // Course codes in two columns, filled down the left first.
    const half = Math.ceil(page.codes.length / 2);
    const codeLines = Array.from({ length: half }, (_, i) => para([run(page.codes[i]), ...(page.codes[i + half] ? [run(`\t${page.codes[i + half]}`)] : [])], { tabs: true }));
    const address = (title: string, lines: string[]) => [para([run(title)], { before: 240 }), ...lines.filter((l) => l.trim()).map((l) => para([run(l.trim())]))];
    return new Table({
      width: { size: LEFT + RIGHT, type: WidthType.DXA },
      columnWidths: [LEFT, RIGHT],
      borders: noBorders,
      rows: [
        new TableRow({ children: [cell(LEFT, heading), cell(RIGHT, [para([run(KIND_TITLE[page.kind], { bold: true })]), ...codeLines])] }),
        new TableRow({ children: [cell(LEFT, address('From,', opts.from)), cell(RIGHT, address('To,', to))] }),
      ],
    });
  };

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  opts.pages.forEach((page, i) => {
    const chairmanTo = [opts.chairman, 'Chairman,', examTitle(page.semester, opts.examYear), `Department of ${opts.department}`, 'University of Rajshahi', 'Rajshahi-6205'];
    children.push(
      new Paragraph({ pageBreakBefore: i > 0, spacing: { before: 1200, after: 0 }, children: [] }),
      copy(page, chairmanTo),
      new Paragraph({ spacing: { before: 2400, after: 0 }, children: [] }),
      copy(page, opts.controller),
    );
  });

  const doc = new Document({
    creator: 'CSE Department Portal',
    title: `Top sheet — Exam ${opts.examYear}`,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1080, right: 1080 } } }, children }],
  });
  return Packer.toBlob(doc);
}
