'use client';

// Reads student details from an existing RU roll sheet (.docx): roll, session, English and Bangla
// names, mother's and father's names. Bangla typed in the old Bijoy (SutonnyMJ) font is stored as
// Latin letters; it is converted to Unicode Bangla here, leaving any Unicode parts of a name as they are.

import { convertBijoyToUnicode } from 'bijoy2unicode';

export type SheetDetails = { roll: string; session: string | null; name: string | null; name_bn: string | null; mother_name: string | null; father_name: string | null; fromBijoy: boolean };

const BANGLA = /[ঀ-৿]/;
const ROLL = /(?<!\d)(\d{10})\s*(20\d\d\s*-\s*\d\d)/g; // roll and session, sometimes typed together ("22385201012021-22")

// Bangla in the Bijoy font → Unicode. Only the non-Unicode stretches are converted, so a name typed
// half in each ("bvBgv আকতার") comes out whole.
export function bijoyToUnicode(text: string) {
  return text
    .replace(/[^ঀ-৿]+/g, (part) => (/[^\s.,:;'"-]/.test(part) ? convertBijoyToUnicode(part) : part))
    .replace(/ৈ([ক-হড়ঢ়য়]?)ৗ/g, '$1ৌ') // "ˆPŠ" typed for চৌ
    .replace(/লস্ন/g, 'ল্ল') // "jø" is ল্ল in SutonnyMJ
    .replace(/([ক-হড়ঢ়য়](?:্[ক-হড়ঢ়য়])*)র্(?![ক-হড়ঢ়য়])/g, 'র্$1') // reph typed after a vowel sign ("Z~h¨©" → তূর্য্য)
    .normalize('NFC')
    .replace(/[।|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(text: string, label: RegExp) {
  const m = text.match(label);
  if (!m) return null;
  return m[1]
    .replace(/[A-Z]{2,5}\s?\d{4}.*$/, '') // a course code glued onto the end of the line
    .replace(/\s+/g, ' ').trim().replace(/^[:\s]+/, '') || null;
}

// Works on the document's paragraphs in reading order, so it handles a table, a sheet whose table was
// lost in conversion, and text where the roll, session and name run together.
export function parseRollSheetHtml(html: string): SheetDetails[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = [...doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')].map((p) => p.textContent ?? '').join('\n');
  const hits = [...text.matchAll(ROLL)];
  const found = new Map<string, SheetDetails>();
  hits.forEach((m, i) => {
    if (found.has(m[1])) return;
    const block = text.slice(m.index + m[0].length, hits[i + 1]?.index ?? text.length);
    const raw = pick(block, /Name\s*\(In\s+Bangla\)\s*:?\s*([^\n]+?)(?=\s*(?:Mother|Father)(?:['’`]s)?\s*(?:Name)?\s*:|\n|$)/i);
    const fromBijoy = !!raw && /[A-Za-z]/.test(raw);
    const bangla = raw && fromBijoy ? bijoyToUnicode(raw) : raw;
    found.set(m[1], {
      roll: m[1],
      session: m[2].replace(/\s/g, ''),
      name: pick(block, /Name(?:\s+of\s+Student)?\s*:\s*([^\n]+?)(?=\s*Name\s*\(In\s|\n|$)/i),
      name_bn: bangla && BANGLA.test(bangla) ? bangla : null,
      mother_name: pick(block, /Mother(?:['’`]s)?(?:\s+Name)?\s*:\s*([^\n]+?)(?=\s*Father|\n|$)/i),
      father_name: pick(block, /Father(?:['’`]s)?(?:\s+Name)?\s*:\s*([^\n]+?)(?=\s*Mother|\n|$)/i),
      fromBijoy,
    });
  });
  return [...found.values()];
}

export async function readRollSheetFile(file: File): Promise<SheetDetails[]> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('Please upload a .docx file. For an old .doc file, open it in Word and use "Save As → Word Document (.docx)" first.');
  }
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return parseRollSheetHtml(value);
}
