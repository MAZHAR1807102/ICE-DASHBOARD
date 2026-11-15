'use client';

import { pdfPagesToLines, type PdfTextItem } from './mcq';

// Reads an uploaded question set (PDF, Word .docx or .txt) into lines of text for parseMcqText.
// The PDF and Word readers are loaded only when needed.
export async function readQuestionFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: { width: number; items: PdfTextItem[] }[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push({
        width: page.getViewport({ scale: 1 }).width,
        // Upright text only: diagonal watermarks are rotated and are left out.
        items: content.items.flatMap((it) => ('str' in it && it.str.trim() && Math.abs(it.transform[1]) < 0.01 && Math.abs(it.transform[2]) < 0.01
          ? [{ x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height, str: it.str }] : [])),
      });
    }
    // Every page, columns in reading order, running headers/footers and page numbers removed.
    const lines = pdfPagesToLines(pages);
    if (!lines.length) {
      throw new Error('This PDF has no readable text — it is probably a scanned image. Use the Word file, or paste the questions as text.');
    }
    return lines;
  }

  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.split(/\r?\n/);
  }

  if (name.endsWith('.txt')) return (await file.text()).split(/\r?\n/);

  throw new Error('Upload a PDF, Word (.docx) or text (.txt) file.');
}
