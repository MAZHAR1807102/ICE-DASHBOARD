'use client';

// Reads student details from an existing RU roll sheet (.docx): roll, session, English and Bangla
// names, mother's and father's names. Bangla typed in the old Bijoy (SutonnyMJ) font isn't Unicode
// and is left out rather than imported as gibberish.

export type SheetDetails = { roll: string; session: string | null; name: string | null; name_bn: string | null; mother_name: string | null; father_name: string | null; legacyBangla: boolean };

const BANGLA = /[ঀ-৿]/;

function pick(text: string, label: RegExp) {
  const m = text.match(label);
  return m ? m[1].replace(/\s+/g, ' ').trim().replace(/^[:\s]+/, '') || null : null;
}

export function parseRollSheetHtml(html: string): SheetDetails[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const found = new Map<string, SheetDetails>();
  doc.querySelectorAll('tr').forEach((tr) => {
    const cells = [...tr.querySelectorAll('td, th')].map((td) =>
      [...td.querySelectorAll('p')].map((p) => p.textContent ?? '').join('\n') || td.textContent || '');
    const text = cells.join('\n');
    // Roll and session are sometimes typed together ("22385201012021-22").
    const m = text.match(/(?<!\d)(\d{10})\s*(20\d\d\s*-\s*\d\d)/);
    if (!m || found.has(m[1])) return;
    const block = text.replace(/[’`]/g, "'");
    const bangla = pick(block, /Name\s*\(In Bangla\)\s*:?\s*([^\n]+?)(?=\s*(?:Mother|Father)'?s?\s*(?:Name)?\s*:|\n|$)/i);
    found.set(m[1], {
      roll: m[1],
      session: m[2].replace(/\s/g, ''),
      name: pick(block, /Name(?:\s+of\s+Student)?\s*:\s*([^\n]+?)(?=\s*Name\s*\(In|\n|$)/i),
      name_bn: bangla && BANGLA.test(bangla) ? bangla : null,
      mother_name: pick(block, /Mother(?:'s)?(?:\s+Name)?\s*:\s*([^\n]+?)(?=\s*Father|\n|$)/i),
      father_name: pick(block, /Father(?:'s)?(?:\s+Name)?\s*:\s*([^\n]+?)(?=\s*Mother|\n|$)/i),
      legacyBangla: !!bangla && !BANGLA.test(bangla),
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
