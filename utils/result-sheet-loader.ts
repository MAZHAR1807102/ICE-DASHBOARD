'use client';

import { pdfPagesToGrid, type Grid, type PdfItem } from './result-sheet';

// Turns an uploaded file into a grid of cells. The PDF and Excel readers are loaded only when needed.
export async function loadResultFile(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: PdfItem[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.flatMap((it) => ('str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }] : [])));
    }
    if (pages.every((items) => items.every((it) => !it.str.trim()))) {
      throw new Error('This PDF has no readable text — it is probably a scanned image. Upload the Excel or Word-exported PDF version instead.');
    }
    return pdfPagesToGrid(pages);
  }

  if (/\.(xlsx|xls|csv|ods)$/.test(name)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '')));
    // Title = the text above the header (first few rows that hold a single long cell).
    const title = rows.slice(0, 6).map((r) => r.filter(Boolean).join(' ')).join(' ');
    return { title, rows };
  }

  throw new Error('Unsupported file type. Upload a PDF, Excel (.xlsx / .xls) or CSV file.');
}
