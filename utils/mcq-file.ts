'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfPagesToLines, pdfQuestionRegions, type CutLine, type PdfTextItem, type QuestionPart, type QuestionRegion } from './mcq';

type PdfPages = { width: number; height: number; items: PdfTextItem[] }[];
export type QuestionSetFile = { lines: string[]; pdf?: { doc: PDFDocumentProxy; pages: PdfPages } };

// Reads an uploaded question set (PDF, Word .docx or .txt) into lines of text for parseMcqText.
// A PDF is also kept open so its questions can be cut out as pictures (questionPictures).
// The PDF and Word readers are loaded only when needed.
export async function readQuestionSet(file: File): Promise<QuestionSetFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: PdfPages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const { width, height } = page.getViewport({ scale: 1 });
      pages.push({
        width, height,
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
    return { lines, pdf: { doc, pages } };
  }

  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { lines: value.split(/\r?\n/) };
  }

  if (name.endsWith('.txt')) return { lines: (await file.text()).split(/\r?\n/) };

  throw new Error('Upload a PDF, Word (.docx) or text (.txt) file.');
}

export const readQuestionFile = async (file: File) => (await readQuestionSet(file)).lines;

// ---------- Questions as pictures ----------
const SCALE = 3; // pixels per PDF point: sharp on phones
const ZOOM = 1.4; // shown at 1.4× the printed size (10 pt text → 14 px)
const INK = 215; // darker than this is print; the faint diagonal watermark and page tint are lighter

export type QuestionPicture = { blob: Blob; width: number; height: number };

// Cuts each question (by its printed number) out of the PDF, blanks the printed number, trims the
// white margins and stacks the pieces of a question split across columns/pages.
export async function questionPictures(pdf: NonNullable<QuestionSetFile['pdf']>, numbers: number[], onProgress?: (done: number) => void) {
  const regions = pdfQuestionRegions(pdf.pages);
  const out = new Map<number, QuestionPicture>();
  const rendered = new Map<number, HTMLCanvasElement>();
  const pageCanvas = async (p: number) => {
    if (!rendered.has(p)) {
      // Keep at most two pages in memory (a question can run from one page into the next).
      for (const k of rendered.keys()) if (k < p - 1) rendered.delete(k);
      const page = await pdf.doc.getPage(p + 1);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      rendered.set(p, canvas);
    }
    return rendered.get(p)!;
  };

  for (const [done, n] of numbers.entries()) {
    const region = regions.get(n);
    const pieces = region ? (await Promise.all(region.parts.map((box) => cutPiece(box, region, pageCanvas, pdf.pages)))).filter((c) => c !== null) : [];
    if (pieces.length) {
      const picture = await stack(pieces);
      if (picture) out.set(n, picture);
    }
    onProgress?.(done + 1);
  }
  return out;
}

// Pixel columns that are a vertical rule (inked nearly top to bottom) — not part of any question.
function ruleColumns(data: Uint8ClampedArray, w: number, h: number) {
  const rule = new Set<number>();
  if (h < 3 * SCALE) return rule;
  for (let x = 0; x < w; x++) {
    let ink = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < INK) ink++;
    }
    if (ink > 0.9 * h) rule.add(x);
  }
  return rule;
}

// The cut above a printed line, moved up past anything tall on it to the nearest blank strip
// (at least 1.2 pt of white across the column). The same answer for the question above and below.
function snapCut(page: HTMLCanvasElement, H: number, box: QuestionPart, at: CutLine, fallback: number) {
  const x = Math.max(0, Math.floor(box.x0 * SCALE)), w = Math.min(page.width - x, Math.ceil((box.x1 - box.x0) * SCALE));
  const yTop = Math.max(0, Math.floor((H - (at.y + 3.5 * at.h)) * SCALE)), yBottom = Math.min(page.height, Math.ceil((H - (at.y + 0.7 * at.h)) * SCALE));
  const h = yBottom - yTop;
  if (w < 4 || h < 4) return fallback;
  const { data } = page.getContext('2d')!.getImageData(x, yTop, w, h);
  const rule = ruleColumns(data, w, h);
  const need = Math.ceil(1.2 * SCALE);
  let run = 0;
  for (let y = h - 1; y >= 0; y--) {
    let blank = true;
    for (let k = 0; k < w && blank; k++) {
      const i = (y * w + k) * 4;
      if (!rule.has(k) && Math.min(data[i], data[i + 1], data[i + 2]) < INK) blank = false;
    }
    run = blank ? run + 1 : 0;
    if (run >= need) return H - (yTop + y + run / 2) / SCALE;
  }
  return fallback;
}

async function cutPiece(part: QuestionPart, region: QuestionRegion, pageCanvas: (p: number) => Promise<HTMLCanvasElement>, pages: PdfPages) {
  const page = await pageCanvas(part.page);
  const H = pages[part.page].height;
  const box = {
    ...part,
    top: part.topAt ? snapCut(page, H, part, part.topAt, part.top) : part.top,
    bottom: part.bottomAt ? snapCut(page, H, part, part.bottomAt, part.bottom) : part.bottom,
  };
  const sx = Math.max(0, Math.floor(box.x0 * SCALE)), sy = Math.max(0, Math.floor((H - box.top) * SCALE));
  const sw = Math.min(page.width - sx, Math.ceil((box.x1 - box.x0) * SCALE)), sh = Math.min(page.height - sy, Math.ceil((box.top - box.bottom) * SCALE));
  if (sw < 4 || sh < 4) return null;
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(page, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.fillStyle = '#fff';
  for (const h of region.hide.filter((h) => h.page === box.page)) {
    ctx.fillRect(h.x0 * SCALE - sx, (H - h.top) * SCALE - sy, (h.x1 - h.x0) * SCALE, (h.top - h.bottom) * SCALE);
  }
  // A line printed across the column under the page header or above the footer is page furniture:
  // blanked where this piece starts at the column top or ends at its bottom.
  const { data } = ctx.getImageData(0, 0, sw, sh);
  const inked = (y: number) => {
    let n = 0;
    for (let x = 0; x < sw; x++) { const i = (y * sw + x) * 4; if (Math.min(data[i], data[i + 1], data[i + 2]) < INK) n++; }
    return n;
  };
  const clearEdgeRules = (from: number, step: number) => {
    for (let y = from, seen = 0; y >= 0 && y < sh && seen < 6 * SCALE; y += step) {
      const n = inked(y);
      if (n > 0.85 * sw) data.fill(255, y * sw * 4, (y + 1) * sw * 4);
      else if (n) break; // reached the print
      else seen++;
    }
  };
  if (!part.bottomAt) clearEdgeRules(sh - 1, -1);
  if (!part.topAt) clearEdgeRules(0, 1);
  ctx.putImageData(new ImageData(data, sw, sh), 0, 0);
  let x0 = sw, x1 = -1, y0 = sh, y1 = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < INK) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 2 * SCALE;
  const t = document.createElement('canvas');
  t.width = x1 - x0 + 1 + 2 * pad;
  t.height = y1 - y0 + 1 + 2 * pad;
  const tctx = t.getContext('2d')!;
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, t.width, t.height);
  tctx.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  return t;
}

// Pieces one under another: a shared passage above its question, a question continued from the column before.
async function stack(pieces: HTMLCanvasElement[]): Promise<QuestionPicture | null> {
  const gap = 4 * SCALE;
  const width = Math.max(...pieces.map((p) => p.width));
  const height = pieces.reduce((h, p) => h + p.height, 0) + gap * (pieces.length - 1);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const p of pieces) {
    ctx.drawImage(p, 0, y);
    y += p.height + gap;
  }
  const blob = await toBlob(c, 'image/webp') ?? await toBlob(c, 'image/png');
  if (!blob) return null;
  return { blob, width: Math.round((width / SCALE) * ZOOM), height: Math.round((height / SCALE) * ZOOM) };
}

// WebP where the browser can make it (much smaller); otherwise PNG.
const toBlob = (c: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b && b.type === type ? b : null), type, 0.92));
