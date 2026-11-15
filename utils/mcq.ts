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
  answers: (number | null)[];
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
const OPTION_MARK = new RegExp(`(?:^|\\s)[(\\[]?(${LETTER})[).\\]]\\s+`, 'g');
const ANSWER_LINE = new RegExp(`^(?:ans(?:wer)?|correct(?:\\s+answer)?|উত্তর|সঠিক\\s*উত্তর)\\s*[:：.=-]?\\s*[(\\[]?(${LETTER})(?![a-zA-Z])[)\\].]?`, 'i');
const KEY_HEADING = /^(?:answer\s*key|answers?|key|উত্তরমালা|উত্তর\s*পত্র|সঠিক\s*উত্তর(?:সমূহ)?)\s*[:：-]?\s*$/i;
const KEY_PAIR = new RegExp(`(\\d{1,3})\\s*[.)\\-:=।]?\\s*[(\\[]?(${LETTER})(?![a-zA-Z\\u0980-\\u09FF])[)\\]]?`, 'g');
const CORRECT_MARK = /(?:^\s*[*✓✔]\s*|\s*[*✓✔]\s*$|\s*\((?:correct|ans)\)\s*$)/i;

// A line that is only "1. b 2. c 3. a" pairs (an answer key without a heading).
function keyPairs(line: string) {
  const pairs = [...line.matchAll(KEY_PAIR)];
  const leftover = line.replace(KEY_PAIR, '').replace(/[\s,;|]/g, '');
  return pairs.length >= 2 && leftover === '' ? pairs.map((m) => [Number(m[1]), letterIndex(m[2])] as const) : null;
}

// Splits "a) one b) two" into labelled pieces; text before the first label is returned as `lead`.
function splitOptions(line: string) {
  const marks = [...line.matchAll(OPTION_MARK)];
  if (!marks.length) return null;
  // Labels must run in order (a, b, c…) so words like "a." inside a sentence aren't split.
  const first = letterIndex(marks[0][1]);
  const pieces: { index: number; text: string }[] = [];
  let expected = first;
  const used: RegExpMatchArray[] = [];
  for (const m of marks) {
    if (letterIndex(m[1]) === expected) {
      used.push(m);
      expected = (expected ?? 0) + 1;
    }
  }
  used.forEach((m, k) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = k + 1 < used.length ? used[k + 1].index ?? line.length : line.length;
    pieces.push({ index: letterIndex(m[1]) ?? 0, text: line.slice(start, end).trim() });
  });
  return { lead: line.slice(0, used[0].index ?? 0).trim(), pieces };
}

export function parseMcqText(input: string | string[]): { questions: McqQuestion[]; warnings: string[] } {
  const lines = (Array.isArray(input) ? input : input.split(/\r?\n/))
    .map((l) => toAsciiDigits(l.replace(/ /g, ' ')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  type Draft = { n: number; text: string[]; options: string[]; answer: number | null; inOptions: boolean };
  const drafts: Draft[] = [];
  const key = new Map<number, number>();
  let current: Draft | null = null;
  let inKey = false;

  for (const line of lines) {
    if (KEY_HEADING.test(line)) { inKey = true; current = null; continue; }
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
    if (q && Number(q[1]) > lastN && Number(q[1]) <= lastN + 5 && (!current || current.options.length >= 2 || !current.text.length)) {
      current = { n: Number(q[1]), text: [], options: [], answer: null, inOptions: false };
      drafts.push(current);
      const rest = q[2] ?? '';
      const split = splitOptions(rest);
      if (split && split.pieces.length >= 2) {
        if (split.lead) current.text.push(split.lead);
        for (const p of split.pieces) addOption(current, p.index, p.text);
      } else if (rest) current.text.push(rest);
      continue;
    }
    if (!current) continue; // title lines, instructions before question 1

    const split = splitOptions(line);
    if (split && (split.pieces[0].index === current.options.length || (split.pieces[0].index === 0 && !current.inOptions))) {
      if (split.lead) {
        if (current.inOptions) current.options[current.options.length - 1] += ` ${split.lead}`;
        else current.text.push(split.lead);
      }
      for (const p of split.pieces) addOption(current, p.index, p.text);
      continue;
    }
    // A continuation of the question or of the last option.
    if (current.inOptions) current.options[current.options.length - 1] += ` ${line}`;
    else current.text.push(line);
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
    return { text: d.text.join(' ').trim(), options, answer };
  });
  if (!questions.length) warnings.push('No numbered questions were found. Make sure each question starts with a number like "1." or "Q1)".');
  return { questions, warnings };
}
