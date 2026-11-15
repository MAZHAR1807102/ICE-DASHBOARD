'use client';

// Reads an uploaded question set (PDF, Word .docx or .txt) into lines of text for parseMcqText.
// The PDF and Word readers are loaded only when needed.
export async function readQuestionFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      // Group text pieces into lines by their height on the page (top to bottom), then left to right.
      const rows: { y: number; items: { x: number; w: number; str: string }[] }[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const x = it.transform[4], y = it.transform[5];
        const row = rows.find((r) => Math.abs(r.y - y) < 3);
        if (row) row.items.push({ x, w: it.width, str: it.str });
        else rows.push({ y, items: [{ x, w: it.width, str: it.str }] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const row of rows) {
        row.items.sort((a, b) => a.x - b.x);
        let text = '';
        let end = -Infinity;
        for (const it of row.items) {
          text += (text && it.x - end > 1.5 ? ' ' : '') + it.str;
          end = it.x + it.w;
        }
        lines.push(text);
      }
    }
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
