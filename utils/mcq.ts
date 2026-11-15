// MCQ exams: question format, reading a question set from plain text (PDF / Word / pasted), grading.
// Pure functions — shared by the HOD panel, the exam page and the /api/mcq routes.

export type McqQuestion = { text: string; options: string[]; answer: number | null };
export type McqStatus = 'draft' | 'open' | 'closed';

export type McqExam = {
  id: string;
  title: string;
  semester: number | null; // null = link + password only
  duration_minutes: number;
  status: McqStatus;
  code: string;
  password: string;
  questions: McqQuestion[];
  shuffle: boolean; // each person gets the questions in their own random order
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
};

export type McqAttempt = {
  id: string;
  exam_id: string;
  student_id: string | null;
  roll: string;
  name: string;
  started_at: string;
  deadline: string;
  question_order: number[] | null; // the order this person sees; null = as written
  answers: (number | null)[]; // always in the original question order
  submitted_at: string | null;
  auto_submitted: boolean;
  score: number | null;
  total: number | null;
};

// What the exam page gets: questions without the answer key while the attempt is running…
export type RunningAttempt = {
  state: 'running';
  title: string;
  name: string;
  roll: string;
  questions: { text: string; options: string[] }[];
  answers: (number | null)[];
  deadline: string;
  now: string; // server clock, so the countdown doesn't depend on the device's clock
};
// …and the full review once it is submitted.
export type FinishedAttempt = {
  state: 'done';
  title: string;
  name: string;
  roll: string;
  score: number;
  total: number;
  auto: boolean;
  submittedAt: string;
  review: { text: string; options: string[]; answer: number | null; picked: number | null }[];
};
export type AttemptView = RunningAttempt | FinishedAttempt;

// Seconds after the deadline in which a submit still counts (slow phone networks).
export const SUBMIT_GRACE_SECONDS = 30;

export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const MAX_OPTIONS = OPTION_LABELS.length;

// ---------- Shuffled question order ----------
// A random order of 0…n-1 (Fisher–Yates with crypto randomness).
export function shuffledOrder(n: number) {
  const order = Array.from({ length: n }, (_, i) => i);
  const r = new Uint32Array(Math.max(n, 1));
  crypto.getRandomValues(r);
  for (let i = n - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
// A stored order is used only if it is a real permutation of the questions (else: as written).
export function validOrder(order: unknown, n: number): number[] {
  const ok = Array.isArray(order) && order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  return ok ? (order as number[]) : Array.from({ length: n }, (_, i) => i);
}
// Original order → the order the person sees, and back.
export const toDisplayOrder = <T,>(order: number[], items: T[]) => order.map((i) => items[i]);
export function fromDisplayOrder<T>(order: number[], shown: T[], empty: T): T[] {
  const out: T[] = order.map(() => empty);
  order.forEach((orig, k) => { out[orig] = shown[k] ?? empty; });
  return out;
}

export function gradeAnswers(questions: McqQuestion[], answers: (number | null)[]) {
  const score = questions.reduce((n, q, i) => n + (q.answer !== null && answers[i] === q.answer ? 1 : 0), 0);
  return { score, total: questions.length };
}

// Keeps only valid picks: one per question, an index of an existing option (or null).
export function cleanAnswers(raw: unknown, questions: { options: string[] }[]): (number | null)[] {
  const list = Array.isArray(raw) ? raw : [];
  return questions.map((q, i) => {
    const v = list[i];
    return Number.isInteger(v) && v >= 0 && v < q.options.length ? (v as number) : null;
  });
}

// Problems that stop an exam from opening (and are shown in the editor).
export function questionProblems(questions: McqQuestion[]) {
  const problems: string[] = [];
  if (!questions.length) problems.push('There are no questions yet.');
  questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) problems.push(`Question ${n} has no text.`);
    const filled = q.options.filter((o) => o.trim()).length;
    if (filled < 2) problems.push(`Question ${n} needs at least 2 options.`);
    if (q.answer === null || !q.options[q.answer]?.trim()) problems.push(`Question ${n} has no correct answer ticked.`);
  });
  return problems;
}

const randomFrom = (alphabet: string, length: number) => {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};
// Link code: lowercase letters/digits without look-alikes (no 0/o, 1/l/i).
export const newExamCode = () => randomFrom('abcdefghjkmnpqrstuvwxyz23456789', 8);
export const newExamPassword = () => randomFrom('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);

// ---------------------------------------------------------------------------------------------
// Reading a question set from text.
//
// Understands the common layouts of department question sets:
//   1. Question text …            Q1) …      ১। …   (numbers in English or Bangla digits)
//   a) option   (b) option   C. option   ক) option  — one per line or several on one line
//   Ans: b   /  Answer: (C)  /  উত্তর: খ           — right after a question
//   an option marked with * or ✓                     — that option is correct
//   an "Answer key" / "Answers" / "উত্তরমালা" section at the end:  1. b  2. c  3-a …
// Everything it reads is shown in the editor for the HOD to check before the exam opens.
// ---------------------------------------------------------------------------------------------

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAsciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const OPTION_LETTER: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, 'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3, 'ঙ': 4, 'চ': 5 };
const letterIndex = (letter: string) => OPTION_LETTER[letter.toLowerCase()] ?? null;

const LETTER = '[a-fA-Fক-ঙচ]';
const QUESTION_START = /^(?:Q(?:uestion)?\s*[.:-]?\s*)?(\d{1,3})\s*[.)\]:।-]\s*(.*)$/i;
// An option label: "a)" "(a)" "a." "[a]" — at the start of the text or after a space.
// The space after a label is left in place, so "(a) (b)" (empty options) still finds both labels.
const OPTION_MARK = new RegExp(`(?:^|\\s)(?:\\((${LETTER})\\)|\\[?(${LETTER})[).\\]](?=\\s))`, 'g');
const markLetter = (m: RegExpMatchArray) => m[1] ?? m[2];
const ANSWER_LINE = new RegExp(`^(?:ans(?:wer)?|correct(?:\\s+answer)?|উত্তর|সঠিক\\s*উত্তর)\\s*[:：.=-]?\\s*[(\\[]?(${LETTER})(?![a-zA-Z])[)\\].]?`, 'i');
const KEY_HEADING = /^(?:answer\s*key|answers?|key|উত্তরমালা|উত্তর\s*পত্র|সঠিক\s*উত্তর(?:সমূহ)?)\s*[:：-]?\s*$/i;
const KEY_PAIR = new RegExp(`(\\d{1,3})\\s*[.)\\-:=।]?\\s*[(\\[]?(${LETTER})(?![a-zA-Z\\u0980-\\u09FF])[)\\]]?`, 'g');
// "Read the following and answer questions 37 and 38:" / "নিচের উদ্দীপকটি পড়ে ৩৭ ও ৩৮ নং প্রশ্নের উত্তর দাও"
const PASSAGE_START = /(?:read|study|observe|look at|consider|refer to)\b[^.:]{0,80}?\bquestions?\s*(?:no\.?\s*)?(\d{1,3})\s*(?:and|&|,|-|–|to)\s*(\d{1,3})|(?:উদ্দীপক|অনুচ্ছেদ|চিত্র|ছক)[^।:]{0,60}?(\d{1,3})\s*(?:ও|এবং|,|-|–|থেকে)\s*(\d{1,3})/i;
const CORRECT_MARK = /(?:^\s*[*✓✔]\s*|\s*[*✓✔]\s*$|\s*\((?:correct|ans)\)\s*$)/i;

// A line that is only "1. b 2. c 3. a" pairs (an answer key without a heading).
function keyPairs(line: string) {
  const pairs = [...line.matchAll(KEY_PAIR)];
  const leftover = line.replace(KEY_PAIR, '').replace(/[\s,;|]/g, '');
  return pairs.length >= 2 && leftover === '' ? pairs.map((m) => [Number(m[1]), letterIndex(m[2])] as const) : null;
}

// The option label a line starts with: its letter index and style ("()lower", ".upper", …).
function labelAtStart(line: string) {
  const m = [...line.matchAll(OPTION_MARK)][0];
  if (!m || (m.index ?? 0) > 0 && line.slice(0, m.index).trim()) return null;
  const l = markLetter(m);
  return { index: letterIndex(l) ?? 0, style: (m[1] !== undefined ? '()' : m[0].trim().slice(-1)) + (l === l.toLowerCase() ? 'lower' : 'upper') };
}

// Splits "a) one b) two" into labelled pieces; text before the first label is returned as `lead`.
// Labels must run in order (a, b, c…) and in one style ("(a) (b)" or "A. B."), so a stray
// "A." in a sentence ("carries 2 A. The field…") or "a." in a word isn't taken for an option.
function splitOptions(line: string) {
  const marks = [...line.matchAll(OPTION_MARK)];
  if (!marks.length) return null;
  const style = (m: RegExpMatchArray) => {
    const l = markLetter(m);
    return (m[1] !== undefined ? '()' : m[0].trim().slice(-1)) + (l === l.toLowerCase() ? 'lower' : 'upper');
  };
  let used: RegExpMatchArray[] = [];
  marks.forEach((first, k) => {
    const run = [first];
    let expected = (letterIndex(markLetter(first)) ?? 0) + 1;
    for (const m of marks.slice(k + 1)) {
      if (style(m) === style(first) && letterIndex(markLetter(m)) === expected) { run.push(m); expected++; }
    }
    if (run.length > used.length) used = run;
  });
  const pieces = used.map((m, k) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = k + 1 < used.length ? used[k + 1].index ?? line.length : line.length;
    return { index: letterIndex(markLetter(m)) ?? 0, text: line.slice(start, end).trim() };
  });
  return { lead: line.slice(0, used[0].index ?? 0).trim(), pieces };
}

export function parseMcqText(input: string | string[]): { questions: McqQuestion[]; warnings: string[] } {
  const lines = (Array.isArray(input) ? input : input.split(/\r?\n/))
    // A stray raised/lowered character from the line above (₂ 87. …) must not hide the question number.
    .map((l) => toAsciiDigits(l.replace(/ /g, ' ')).replace(/\s+/g, ' ').trim().replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉₋₊\s]+(?=\d)/, ''))
    .filter(Boolean);

  type Draft = { n: number; text: string[]; options: string[]; answer: number | null; inOptions: boolean };
  const drafts: Draft[] = [];
  const key = new Map<number, number>();
  let current: Draft | null = null;
  let inKey = false;
  // A passage shared by several questions ("Read the following and answer questions 37 and 38: …").
  const passages: { from: number; to: number; text: string[] }[] = [];
  let passage: (typeof passages)[number] | null = null;

  for (const [lineNo, line] of lines.entries()) {
    if (KEY_HEADING.test(line)) { inKey = true; current = null; passage = null; continue; }
    const shared = line.match(PASSAGE_START);
    if (shared) {
      const [from, to] = [Number(shared[1] ?? shared[3]), Number(shared[2] ?? shared[4])].sort((a, b) => a - b);
      passage = { from, to: to - from > 10 ? from : to, text: [] };
      passages.push(passage);
      const after = line.slice((shared.index ?? 0) + shared[0].length).replace(/^[^:：]*[:：]\s*/, '').trim();
      if (after && !/^\d/.test(after)) passage.text.push(after);
      current = null;
      continue;
    }
    const pairs = keyPairs(line);
    if (inKey || (pairs && (!current || current.options.length >= 2))) {
      for (const [n, a] of pairs ?? [...line.matchAll(KEY_PAIR)].map((m) => [Number(m[1]), letterIndex(m[2])] as const)) {
        if (a !== null) key.set(n, a);
      }
      if (pairs || inKey) continue;
    }

    const answer = line.match(ANSWER_LINE);
    if (answer && current) {
      current.answer = letterIndex(answer[1]);
      continue;
    }

    const q = line.match(QUESTION_START);
    const lastN: number = drafts.length ? drafts[drafts.length - 1].n : 0;
    // The next number in sequence always starts a question (so one damaged question can't swallow the rest).
    if (q && Number(q[1]) > lastN && Number(q[1]) <= lastN + 5 && (!current || current.options.length >= 2 || !current.text.length || Number(q[1]) === lastN + 1)) {
      current = { n: Number(q[1]), text: [], options: [], answer: null, inOptions: false };
      drafts.push(current);
      passage = null;
      const rest = q[2] ?? '';
      const split = splitOptions(rest);
      if (split && split.pieces.length >= 2) {
        if (split.lead) current.text.push(split.lead);
        for (const p of split.pieces) addOption(current, p.index, p.text);
      } else if (rest) current.text.push(rest);
      continue;
    }
    if (passage && !current) { passage.text.push(line); continue; }
    if (!current) continue; // title lines, instructions before question 1

    const split = splitOptions(line);
    if (split && (split.pieces[0].index === current.options.length || (split.pieces[0].index === 0 && !current.inOptions)) && !strayFirstLabel(split, lineNo)) {
      if (split.lead) {
        if (current.inOptions) current.options[current.options.length - 1] = joinWrapped(current.options[current.options.length - 1], split.lead);
        else current.text.push(split.lead);
      }
      for (const p of split.pieces) addOption(current, p.index, p.text);
      continue;
    }
    // A continuation of the question or of the last option.
    if (current.inOptions) current.options[current.options.length - 1] = joinWrapped(current.options[current.options.length - 1], line);
    else current.text.push(line);
  }

  // "carries 2" / "A. The field at its centre is…": a lone first label whose style the next lines don't
  // continue (no "B."), while they do start labels of another style ("(a)"), is part of the question.
  function strayFirstLabel(split: NonNullable<ReturnType<typeof splitOptions>>, lineNo: number) {
    if (split.pieces.length !== 1 || split.pieces[0].index !== 0 || current?.inOptions) return false;
    const mine = labelAtStart(lines[lineNo]);
    const next = lines.slice(lineNo + 1, lineNo + 4).map(labelAtStart);
    const continues = next.some((l) => l && l.index === 1 && l.style === mine?.style);
    const otherStart = next.some((l) => l && l.index === 0 && l.style !== mine?.style);
    return !continues && otherStart;
  }

  function addOption(d: Draft, index: number, text: string) {
    let t = text;
    if (CORRECT_MARK.test(t)) {
      t = t.replace(CORRECT_MARK, '').trim();
      d.answer = index;
    }
    d.options[index] = t;
    d.inOptions = true;
  }

  const warnings: string[] = [];
  const questions = drafts.map((d, i) => {
    const options = Array.from({ length: Math.min(Math.max(d.options.length, 2), MAX_OPTIONS) }, (_, k) => (d.options[k] ?? '').trim());
    let answer = d.answer ?? key.get(d.n) ?? null;
    if (answer !== null && !options[answer]) answer = null;
    if (d.options.filter(Boolean).length < 2) warnings.push(`Question ${i + 1}: fewer than 2 options were found — check it.`);
    if (answer === null) warnings.push(`Question ${i + 1}: no correct answer found — tick it.`);
    const own = d.text.reduce((a, b) => (a ? joinWrapped(a, b) : b), '').trim();
    const shared = passages.find((p) => d.n >= p.from && d.n <= p.to && p.text.length);
    const text = shared ? `${shared.text.reduce((a, b) => (a ? joinWrapped(a, b) : b), '')}\n\n${own}` : own;
    return { text, options, answer };
  });
  if (!questions.length) warnings.push('No numbered questions were found. Make sure each question starts with a number like "1." or "Q1)".');
  return { questions, warnings };
}

// ---------------------------------------------------------------------------------------------
// A separate answer-key file (questions in one file, answers in another).
//
// Understands, in any mix:
//   1. b    1) (B)    1-b    Q1: B    1 b    ১। খ     — several per line is fine
//   1. b) Stack                                       — the letter is used
//   1. Stack                                          — matched to that question's option text
//   a table: a row of question numbers, the next row their letters (1 2 3 4 / b c a d)
//   only letters, in question order: b c a d …        — when the key has no numbers at all
// Question k of the key is question k in the editor.
// ---------------------------------------------------------------------------------------------

const LETTER_ONLY = new RegExp(`^[(\\[]?(${LETTER})[)\\].]?$`);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, ' ').trim();

export function parseAnswerKey(input: string | string[]) {
  const lines = (Array.isArray(input) ? input : input.split(/\r?\n/))
    .map((l) => toAsciiDigits(l.replace(/ /g, ' ')).replace(/\s+/g, ' ').trim())
    // A label in front ("Answers: 1-b, 2-c") is dropped; a heading on its own line is skipped below.
    .map((l) => l.replace(/^(?:answer\s*key|answers?|key|উত্তরমালা|উত্তর|সঠিক\s*উত্তর)\s*[:：-]\s*/i, ''))
    .filter(Boolean);
  // How sure each answer is: 3 = key grid/table, 2 = "4. (b) hertz", 1 = written out ("4. hertz").
  // A surer answer is never replaced (worked hints like "8.4 − 2.0" or "3 F = ma" can't overwrite the key).
  const key = new Map<number, { value: string; rank: number }>();
  const put = (n: number, value: string, rank: number) => {
    const had = key.get(n);
    if (!had || rank > had.rank) key.set(n, { value, rank });
  };
  const sequence: string[] = []; // letters with no numbers, in order

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tokens = line.split(/[\s,;|]+/).filter(Boolean);
    // A row of numbers followed by a row of the same number of letters (a key table).
    const next = lines[i + 1]?.split(/[\s,;|]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((t) => /^\d{1,3}[.)]?$/.test(t)) && next && next.length === tokens.length && next.every((t) => LETTER_ONLY.test(t))) {
      tokens.forEach((t, k) => put(parseInt(t, 10), next[k].match(LETTER_ONLY)![1], 3));
      i++;
      continue;
    }
    // Only letters: answers in question order.
    if (tokens.length && tokens.every((t) => LETTER_ONLY.test(t)) && !/^\d/.test(line)) {
      sequence.push(...tokens.map((t) => t.match(LETTER_ONLY)![1]));
      continue;
    }
    // "1. b 2. c …" pairs, or a single "7 b" — the key grid.
    const single = line.match(new RegExp(`^(\\d{1,3})\\s*[.)\\-:=।]?\\s*[(\\[]?(${LETTER})[)\\]]?$`));
    if (keyPairs(line) || single) {
      for (const m of line.matchAll(KEY_PAIR)) put(Number(m[1]), m[2], 3);
      continue;
    }
    // "4. (b) hertz", "Q4: B", "4. hertz" — one answer on the line ("8.4" is a number, not question 8).
    const one = line.match(/^(?:Q(?:uestion)?\s*[.:-]?\s*)?(\d{1,3})\s*[.)\]:।=-](?!\d)\s*(.+)$/i);
    if (one) {
      const n = Number(one[1]), rest = one[2].trim();
      const letter = rest.match(new RegExp(`^(?:\\((${LETTER})\\)|\\[?(${LETTER})[)\\].]?(?=\\s|$))`));
      if (letter) put(n, letter[1] ?? letter[2], 2);
      else put(n, rest, 1);
    }
  }
  if (!key.size) sequence.forEach((a, k) => put(k + 1, a, 3));
  return new Map([...key].map(([n, v]) => [n, v.value]));
}

// Ticks the answers from a key onto the questions. Returns the new questions and what didn't match.
export function applyAnswerKey(questions: McqQuestion[], key: Map<number, string>) {
  const missing: number[] = [], unclear: number[] = [];
  let matched = 0;
  const updated = questions.map((q, i) => {
    const raw = key.get(i + 1);
    if (raw === undefined) { missing.push(i + 1); return q; }
    let answer: number | null = raw.length <= 3 ? letterIndex(raw.replace(/[()[\].]/g, '')) : null;
    if (answer === null) {
      // The answer written out: match the option text (exact first, then contained).
      const want = norm(raw);
      const options = q.options.map(norm);
      const exact = options.indexOf(want);
      const contained = options.findIndex((o) => o && (want.includes(o) || o.includes(want)));
      answer = exact >= 0 ? exact : contained >= 0 && want.length >= 2 ? contained : null;
    }
    if (answer === null || answer >= q.options.length || !q.options[answer]?.trim()) { unclear.push(i + 1); return q; }
    matched++;
    return { ...q, answer };
  });
  const extra = [...key.keys()].filter((n) => n > questions.length).length;
  return { questions: updated, matched, missing, unclear, extra };
}

// ---------------------------------------------------------------------------------------------
// PDF layout → lines in reading order (pure, so it can be tested without a browser).
//
// * Every page is read, top to bottom. Rotated text (diagonal watermarks) is skipped.
// * Two-column pages (common in MCQ papers): if a page has an empty vertical band near the middle
//   with text on both sides, the left column is read before the right one. Lines that run across
//   both columns (a title, a heading) stay above or below them.
// * Superscripts/subscripts stay on their line, written 10^−23, H_2.
// * Options printed side by side that wrap onto the next line ("(a) attraction between / molecules")
//   get their wrapped words back, by position under each option.
// * Running headers/footers: a line at the top or bottom of a page that repeats on other pages
//   (page numbers ignored) or is only a page number is dropped, so it doesn't end up inside the
//   last option before a page break.
// ---------------------------------------------------------------------------------------------

export type PdfTextItem = { x: number; y: number; w: number; h: number; str: string };
type Seg = { x: number; end: number; text: string };
type Row = { y: number; h: number; segs: Seg[] };

const OPTION_START = new RegExp(`^(?:\\(${LETTER}\\)|\\[?${LETTER}[).\\]]\\s)`);
const NUMBER_START = /^(?:Q(?:uestion)?\s*)?[0-9০-৯]{1,3}\s*[.)\]:।]/i;

function buildRows(input: PdfTextItem[]): Row[] {
  // A tall square-root sign belongs to the formula right after it (√P² + Q²), not a line of its own.
  const items = input.map((it) => {
    if (!/^\s*√/.test(it.str) || it.str.replace(/[√\uFE00-\uFE0F\s]/g, '')) return it;
    const next = input.filter((k) => k !== it && !/^\s*√/.test(k.str) && k.x >= it.x + it.w - 2 && k.x <= it.x + it.w + 4 && Math.abs(k.y - it.y) < 2 * it.h)
      .sort((a, b) => Math.abs(a.y - it.y) - Math.abs(b.y - it.y))[0];
    return { ...it, str: '√', y: next?.y ?? it.y, h: next?.h ?? it.h };
  });
  // Rows from full-size text first; smaller raised/lowered text joins the row it sits on.
  const sorted = [...items].sort((a, b) => b.h - a.h);
  const rows: { y: number; h: number; items: (PdfTextItem & { mark: string })[] }[] = [];
  for (const it of sorted) {
    const row = rows.find((r) => it.y > r.y - 0.45 * r.h && it.y < r.y + 0.6 * r.h && (it.h < r.h * 0.9 ? true : Math.abs(it.y - r.y) < 0.3 * r.h));
    if (!row) { rows.push({ y: it.y, h: it.h, items: [{ ...it, mark: '' }] }); continue; }
    const small = it.h < row.h * 0.9;
    const mark = small && it.y > row.y + 0.15 * row.h ? '^' : small && it.y < row.y - 0.1 * row.h ? '_' : '';
    row.items.push({ ...it, mark });
  }
  rows.sort((a, b) => b.y - a.y); // PDF y grows upwards
  return rows.map((row) => {
    row.items.sort((a, b) => a.x - b.x);
    // A small number above another at the same place is a fraction (3 over 2 → 3/2).
    const items: typeof row.items = [];
    for (const it of row.items) {
      const prev = items[items.length - 1];
      const stacked = prev && ((prev.mark === '^' && it.mark === '_') || (prev.mark === '_' && it.mark === '^')) && it.x < prev.x + prev.w - 0.5;
      if (prev && stacked) {
        const [num, den] = prev.mark === '^' ? [prev, it] : [it, prev];
        items[items.length - 1] = { ...prev, x: Math.min(prev.x, it.x), w: Math.max(prev.x + prev.w, it.x + it.w) - Math.min(prev.x, it.x), str: ` ${num.str.trim()}/${den.str.trim()} `, mark: '' };
      } else items.push(it);
    }
    const segs: Seg[] = [];
    for (const it of items) {
      const last = segs[segs.length - 1];
      const gap = last ? it.x - last.end : Infinity;
      const piece = it.mark === '^' ? superscript(it.str.trim()) : it.mark === '_' ? subscript(it.str.trim()) : it.str;
      if (last && gap < Math.max(6, 1.1 * row.h)) {
        last.text += (gap > 1.5 && !it.mark ? ' ' : '') + piece;
        last.end = Math.max(last.end, it.x + it.w);
      } else segs.push({ x: it.x, end: it.x + it.w, text: piece });
    }
    segs.forEach((g) => { g.text = g.text.replace(/\s+/g, ' ').trim(); });
    return { y: row.y, h: row.h, segs: segs.filter((g) => g.text) };
  }).filter((r) => r.segs.length);
}

const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '−': '⁻', '-': '⁻', '+': '⁺', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', '◦': '°', '∘': '°', '°': '°', '′': '′', '∗': '*' };
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '−': '₋', '-': '₋', '+': '₊', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ', i: 'ᵢ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ' };
// Raised/lowered text as Unicode where it exists (10⁻²³, T₂, 30°), else ^(…) / _(…).
const superscript = (s: string) => ([...s].every((c) => c in SUP) ? [...s].map((c) => SUP[c]).join('') : `^(${s})`);
const subscript = (s: string) => ([...s].every((c) => c in SUB) ? [...s].map((c) => SUB[c]).join('') : `_(${s})`);

// Side-by-side options whose text wraps: give each wrapped piece back to the option above it.
function mergeOptionWraps(rows: Row[]): Row[] {
  const out: Row[] = [];
  let optionRow: Row | null = null;
  for (const row of rows) {
    const starts = (g: Seg) => OPTION_START.test(g.text + ' ') || NUMBER_START.test(g.text);
    if (row.segs.some(starts)) {
      optionRow = row.segs.filter((g) => OPTION_START.test(g.text + ' ')).length >= 2 ? row : null;
      out.push(row);
      continue;
    }
    // A wrapped piece sits indented under an option's text, close below it — and isn't an answer line.
    const line = row.segs.map((g) => g.text).join(' ');
    const wrap = optionRow && row.segs[0].x > optionRow.segs[0].x + 2 && optionRow.y - row.y < 2.2 * optionRow.h
      && !ANSWER_LINE.test(line) && !KEY_HEADING.test(line) && !PASSAGE_START.test(line);
    if (optionRow && wrap) {
      for (const g of row.segs) {
        const target = [...optionRow.segs].reverse().find((o) => o.x <= g.x + 4) ?? optionRow.segs[0];
        target.text = joinWrapped(target.text, g.text);
      }
      optionRow = { ...optionRow, y: row.y };
      out[out.length - 1] = { ...out[out.length - 1], segs: out[out.length - 1].segs };
      continue;
    }
    optionRow = null;
    out.push(row);
  }
  return out;
}

// "be-" + "tween" → "between"; otherwise joined with a space.
export const joinWrapped = (a: string, b: string) => (/[a-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : `${a} ${b}`);

// The x of the gap between two columns, or null for a one-column page.
function columnGap(items: PdfTextItem[], width: number): number | null {
  const BINS = 240;
  const covered = new Array(BINS).fill(0);
  const narrow = items.filter((it) => it.w < width * 0.45);
  for (const it of narrow) {
    const a = Math.max(0, Math.floor((it.x / width) * BINS));
    const b = Math.min(BINS - 1, Math.floor(((it.x + it.w) / width) * BINS));
    for (let k = a; k <= b; k++) covered[k]++;
  }
  // Longest (nearly) empty run in the middle 30–70% of the page — a few centred title lines may cross it.
  const limit = Math.max(2, narrow.length * 0.03);
  let best = { len: 0, at: -1 }, run = 0;
  for (let k = Math.floor(BINS * 0.3); k <= Math.ceil(BINS * 0.7); k++) {
    run = covered[k] <= limit ? run + 1 : 0;
    if (run > best.len) best = { len: run, at: k - run + 1 };
  }
  if (best.len < BINS * 0.012) return null;
  const gap = ((best.at + best.len / 2) / BINS) * width;
  const left = narrow.filter((it) => it.x + it.w <= gap).length;
  const right = narrow.filter((it) => it.x >= gap).length;
  return left >= 5 && right >= 5 ? gap : null;
}

const rowsToLines = (rows: Row[]) => mergeOptionWraps(rows).map((r) => r.segs.map((g) => g.text).join(' '));

function pageLines(items: PdfTextItem[], width: number, titleAbove: number | null) {
  // Title block (first page): everything above question 1 is read across the full width first.
  const title = titleAbove === null ? [] : items.filter((it) => it.y > titleAbove);
  const body = titleAbove === null ? items : items.filter((it) => it.y <= titleAbove);
  const gap = columnGap(body, width);
  if (gap === null) return [...rowsToLines(buildRows(title)), ...rowsToLines(buildRows(body))];
  const left = body.filter((it) => it.x + it.w <= gap + 2);
  const right = body.filter((it) => it.x >= gap - 2 && !left.includes(it));
  const across = body.filter((it) => !left.includes(it) && !right.includes(it));
  const colItems = [...left, ...right];
  const colTop = colItems.length ? Math.max(...colItems.map((it) => it.y)) : Infinity;
  const colBottom = colItems.length ? Math.min(...colItems.map((it) => it.y)) : -Infinity;
  return [
    ...rowsToLines(buildRows(title)),
    ...rowsToLines(buildRows(across.filter((it) => it.y > colTop))),
    ...rowsToLines(buildRows([...left, ...across.filter((it) => it.y <= colTop && it.y >= colBottom)])),
    ...rowsToLines(buildRows(right)),
    ...rowsToLines(buildRows(across.filter((it) => it.y < colBottom))),
  ];
}

const PAGE_NUMBER = /^[-–—(\s]*(?:page|p\.?|পৃষ্ঠা)?\s*\d{1,3}\s*(?:(?:of|\/)\s*\d{1,3})?[-–—)\s]*$/i;

export function pdfPagesToLines(pages: { width: number; items: PdfTextItem[] }[]): string[] {
  // Running headers/footers: the top and bottom two rows of each page, piece by piece. A piece that
  // repeats on other pages (digits ignored), or is only a page number, is removed before reading.
  const shape = (t: string) => toAsciiDigits(t).replace(/\d+/g, '#').toLowerCase().trim();
  const edges = pages.map((page) => {
    const rows = buildRows(page.items.filter((it) => it.str.trim()));
    return [...rows.slice(0, 2), ...rows.slice(-2)];
  });
  const seen = new Map<string, number>();
  for (const rows of edges) for (const sh of new Set(rows.flatMap((r) => r.segs.map((g) => shape(g.text))))) seen.set(sh, (seen.get(sh) ?? 0) + 1);
  // Exam content is never furniture, however alike it looks from page to page.
  const content = (t: string) => NUMBER_START.test(t) || OPTION_START.test(t) || ANSWER_LINE.test(t) || /\?\s*$/.test(t) || PASSAGE_START.test(t);
  const furniture = (t: string) => !content(t) && ((pages.length >= 2 && (seen.get(shape(t)) ?? 0) >= Math.max(2, Math.ceil(pages.length / 2))) || PAGE_NUMBER.test(toAsciiDigits(t)));

  let questionsStarted = false;
  return pages.flatMap((page, p) => {
    const drop = edges[p].flatMap((r) => r.segs.filter((g) => furniture(g.text)).map((g) => ({ y: r.y, h: r.h, x: g.x, end: g.end })));
    const items = page.items.filter((it) => it.str.trim() && !drop.some((d) => Math.abs(it.y - d.y) < 0.6 * d.h && it.x >= d.x - 1 && it.x + it.w <= d.end + 1));
    // Until the first question appears, text above it on that page is the title block.
    let titleAbove: number | null = null;
    if (!questionsStarted) {
      const firstQ = items.filter((it) => /^\s*(?:Q\s*)?[1১]\s*[.)।]/.test(it.str)).sort((a, b) => b.y - a.y)[0];
      if (firstQ) { titleAbove = firstQ.y + 0.6 * firstQ.h; questionsStarted = true; }
    }
    return pageLines(items, page.width, titleAbove);
  });
}
