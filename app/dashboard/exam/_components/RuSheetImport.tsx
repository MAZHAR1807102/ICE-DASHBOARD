'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, GraduationCap, Sparkles, UserX } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { inferCredits, parseResultSheet, solveCreditsFromGpa, type ParsedSheet } from '../../../../utils/result-sheet';
import { examKey } from '../../../../utils/grades';
import { loadResultFile } from '../../../../utils/result-sheet-loader';
import { SEMESTERS, type Course, type Student } from '../../../../utils/types';
import { Badge, Button, cx, inputClass, table } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';

type Roster = Pick<Student, 'id' | 'college_id' | 'ru_id' | 'name' | 'semester'>[];

// Imports RU's official tabulation sheet (PDF / Excel / CSV): one row per Roll, one column per course.
export default function RuSheetImport({ students, onPublished }: { students: Roster; onPublished: (message: string) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [semester, setSemester] = useState(1);
  const [credits, setCredits] = useState<Record<string, string>>({}); // keyed by the column as read from the file
  const [codes, setCodes] = useState<Record<string, string>>({}); // corrected course code per column
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [suggested, setSuggested] = useState<Record<string, number>>({});
  const [solvedCheck, setSolvedCheck] = useState<{ reproduced: number; checked: number } | null>(null);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('courses').select('*').then(({ data }) => setCatalog((data ?? []) as Course[]));
  }, []);

  const byRoll = useMemo(() => new Map(students.filter((s) => s.ru_id).map((s) => [s.ru_id!.trim(), s])), [students]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsReading(true);
    setError('');
    setSheet(null);
    try {
      const parsed = parseResultSheet(await loadResultFile(file));
      if (parsed.courses.length === 0 || parsed.students.length === 0) throw new Error(parsed.problems[0] ?? 'Nothing to import was found in this file.');
      // Best source first: credits solved from the printed GPAs (verified against every student),
      // then single-F deductions from the EC column, then the course list.
      const solved = solveCreditsFromGpa(parsed);
      const trusted = solved && solved.reproduced >= solved.checked * 0.9 ? solved : null;
      const inferred = { ...inferCredits(parsed), ...(trusted?.credits ?? {}) };
      setSuggested(inferred);
      setSolvedCheck(trusted ? { reproduced: trusted.reproduced, checked: trusted.checked } : null);
      setCredits(Object.fromEntries(parsed.courses.map((code) => {
        const known = catalog.find((c) => c.course_code.toUpperCase() === code);
        return [code, String(inferred[code] ?? known?.credit ?? '')];
      })));
      setCodes(Object.fromEntries(parsed.courses.map((c) => [c, c])));
      setIncluded(Object.fromEntries(parsed.courses.map((c) => [c, true])));
      setSemester(parsed.semesterGuess ?? 1);
      setSheet(parsed);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    } finally {
      setIsReading(false);
    }
  };

  const matched = sheet ? sheet.students.filter((s) => byRoll.has(s.roll)) : [];
  const unmatched = sheet ? sheet.students.filter((s) => !byRoll.has(s.roll)) : [];

  // Columns as read from the file; each can be renamed (if the code was misread) or left out.
  const finalCode = (col: string) => (codes[col] ?? col).toUpperCase().replace(/\s+/g, '');
  const columns = sheet ? sheet.courses.filter((c) => included[c] !== false) : [];
  const codeCounts = columns.reduce<Record<string, number>>((m, c) => ((m[finalCode(c)] = (m[finalCode(c)] ?? 0) + 1), m), {});
  const duplicateCodes = Object.keys(codeCounts).filter((c) => codeCounts[c] > 1);
  const emptyCodes = columns.filter((c) => !finalCode(c));
  const oddCodes = columns.filter((c) => finalCode(c) && !/^[A-Z]{2,5}\d{4}$/.test(finalCode(c)));
  const catalogFor = (col: string) => catalog.find((c) => c.course_code.toUpperCase().replace(/\s+/g, '') === finalCode(col));

  const absent = matched.filter((s) => columns.every((c) => !s.grades[c]));
  const gradeCount = matched.reduce((n, s) => n + columns.filter((c) => s.grades[c]).length, 0);
  const missingCredit = columns.filter((c) => !(Number(credits[c]) > 0));
  const blocked = matched.length === 0 || columns.length === 0 || missingCredit.length > 0 || duplicateCodes.length > 0 || emptyCodes.length > 0;

  // Students whose credits (excluding F) don't add up to the EC printed on the sheet.
  const ecMismatches = sheet && missingCredit.length === 0 && columns.length === sheet.courses.length
    ? matched.filter((s) => {
        if (s.ec === undefined || columns.some((c) => !s.grades[c])) return false;
        const earned = columns.filter((c) => s.grades[c] !== 'F').reduce((sum, c) => sum + Number(credits[c]), 0);
        return Math.abs(earned - s.ec) > 0.01;
      })
    : [];

  // What each column holds, to help spot a misread header: "24 grades · mostly B, A-, C+".
  const columnSummary = (col: string) => {
    const grades = matched.map((s) => s.grades[col]).filter(Boolean);
    const top = Object.entries(grades.reduce<Record<string, number>>((m, g) => ((m[g] = (m[g] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    return grades.length ? `${grades.length} grade${grades.length === 1 ? '' : 's'} · mostly ${top.join(', ')}` : 'no grades for our students';
  };

  const handlePublish = async () => {
    if (!sheet || blocked) return;
    const renamed = columns.filter((c) => finalCode(c) !== c);
    const ok = await confirm({
      title: `Publish semester ${semester} results for ${matched.length} students?`,
      body: `${renamed.length ? `Corrected codes: ${renamed.map((c) => `${c} → ${finalCode(c)}`).join(', ')}.\n` : ''}${gradeCount} course grades${sheet.hasOfficialFigures ? ' plus the official EC, GPA, YGPA, result and merit' : ''}. Students see them immediately and their CGPA is recalculated.\n\nRe-uploading this same exam replaces it. A different exam (retake or improvement) is kept as another attempt — the best grade counts.`,
      confirmLabel: 'Publish results',
    });
    if (!ok) return;

    setIsPublishing(true);
    const key = examKey(sheet.title);
    const courseRows = matched.flatMap((s) => columns.filter((c) => s.grades[c]).map((col) => ({
      student_id: byRoll.get(s.roll)!.id,
      semester,
      exam_key: key,
      course_code: finalCode(col),
      course_name: catalogFor(col)?.course_name ?? null,
      credit: Number(credits[col]),
      grade: s.grades[col],
    })));
    const summaryRows = !sheet.hasOfficialFigures ? [] : matched.map((s) => ({
        student_id: byRoll.get(s.roll)!.id,
        semester,
        exam_key: key,
        exam_title: sheet.title || null,
        earned_credits: s.ec ?? null,
        gpa: s.gpa ?? null,
        year_earned_credits: s.yec ?? null,
        ygpa: s.ygpa ?? null,
        result_status: s.result ?? null,
        merit_position: s.merit ?? null,
      }));
    // One database step: grades and official figures are saved together, or nothing is.
    const { error } = await supabase.rpc('publish_results', { p_courses: courseRows, p_summaries: summaryRows });
    setIsPublishing(false);

    if (error) return toast.error(`Results not published — nothing was saved.\n${error.message}`);
    onPublished(`Published semester ${semester} results for ${matched.length} students (${gradeCount} grades).`);
  };

  if (!sheet) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Upload the result sheet exactly as RU sends it — <b>PDF</b>, <b>Excel</b> or <b>CSV</b>. Students are matched by <b>Roll</b> (their RU ID); rows for other colleges are skipped.
        </p>
        <label className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/40', isReading && 'pointer-events-none opacity-60')}>
          <FileUp className="size-8 text-indigo-500" aria-hidden />
          <span className="font-semibold text-slate-900">{isReading ? 'Reading the sheet…' : 'Choose the result file'}</span>
          <span className="text-xs text-slate-500">PDF, .xlsx, .xls or .csv</span>
          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.ods" className="hidden" onChange={handleFile} />
        </label>
        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{sheet.title || fileName}</p>
          <p className="truncate text-xs text-slate-500">{fileName} · {sheet.courses.length} courses · {sheet.students.length} rows</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={`${inputClass} w-36`} aria-label="Semester">
            {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setSheet(null)}>Change file</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Our students', value: matched.length, tone: 'text-emerald-700' },
          { label: 'Grades', value: gradeCount, tone: 'text-slate-900' },
          { label: 'Absent', value: absent.length, tone: 'text-amber-700' },
          { label: 'Other colleges', value: unmatched.length, tone: 'text-slate-400' },
        ].map((t) => (
          <div key={t.label} className="rounded-xl p-3 text-center ring-1 ring-slate-200">
            <p className={`text-2xl font-bold tabular-nums ${t.tone}`}>{t.value}</p>
            <p className="text-xs font-medium text-slate-500">{t.label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-900">Courses on this sheet</p>
        <p className="mb-2 text-xs text-slate-500">Check each course code and credit. Fix a code the file was read wrong for, or switch off a column that isn&apos;t a course.</p>
        <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>
                <th className={`${table.th} w-12`}><span className="sr-only">Include</span></th>
                <th className={table.th}>Course code</th>
                <th className={table.th}>What&apos;s in this column</th>
                <th className={`${table.th} w-24`}>Credit</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {sheet.courses.map((col) => {
                const on = included[col] !== false;
                const code = finalCode(col);
                const known = catalogFor(col);
                const guess = suggested[col];
                const isDuplicate = on && duplicateCodes.includes(code);
                const isOdd = on && oddCodes.includes(col);
                return (
                  <tr key={col} className={on ? '' : 'bg-slate-50 opacity-60'}>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="checkbox" checked={on} aria-label={`Include ${col}`}
                        onChange={(e) => setIncluded({ ...included, [col]: e.target.checked })}
                        className="mt-2 size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text" value={codes[col] ?? col} disabled={!on} aria-label={`Course code for column ${col}`}
                        onChange={(e) => setCodes({ ...codes, [col]: e.target.value.toUpperCase() })}
                        className={cx(inputClass, 'h-8 w-32 font-mono font-semibold uppercase', (isDuplicate || (on && !code)) && 'ring-rose-400', isOdd && 'ring-amber-400')}
                      />
                      {code !== col && on && <p className="mt-1 text-[11px] text-indigo-600">Read as {col}</p>}
                      {isDuplicate && <p className="mt-1 text-[11px] text-rose-600">Used by another column too</p>}
                      {isOdd && !isDuplicate && <p className="mt-1 text-[11px] text-amber-700">Unusual code — double-check</p>}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <p className="text-sm text-slate-800">{known?.course_name ?? <span className="text-slate-400">Not in the course list</span>}</p>
                      <p className="text-xs text-slate-500">{columnSummary(col)}</p>
                      {guess !== undefined && on && <Badge tone="violet"><Sparkles className="size-3" aria-hidden />{guess} credits {solvedCheck ? 'from the GPAs' : 'from EC'}</Badge>}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="number" step="0.25" min="0" value={credits[col] ?? ''} disabled={!on} aria-label={`Credit for ${col}`}
                        onChange={(e) => setCredits({ ...credits, [col]: e.target.value })}
                        className={cx(inputClass, 'h-8 text-center', on && !(Number(credits[col]) > 0) && 'ring-rose-400')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {duplicateCodes.length > 0 && <p className="mt-2 text-xs text-rose-600">Two columns can&apos;t have the same code: {duplicateCodes.join(', ')}.</p>}
        {emptyCodes.length > 0 && <p className="mt-2 text-xs text-rose-600">Every included column needs a course code.</p>}
        {missingCredit.length > 0 && <p className="mt-2 text-xs text-rose-600">Enter the credit for {missingCredit.map(finalCode).join(', ')}.</p>}
        {solvedCheck && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="size-3.5" aria-hidden /> Credits worked out from the sheet — they reproduce {solvedCheck.reproduced} of {solvedCheck.checked} printed GPAs exactly.
          </p>
        )}
        {ecMismatches.length > 0 && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            For {ecMismatches.length} student{ecMismatches.length === 1 ? '' : 's'} the credits don&apos;t add up to the EC on the sheet (e.g. Roll {ecMismatches[0].roll}: EC {ecMismatches[0].ec}). Check the credits above.
          </p>
        )}
        {ecMismatches.length === 0 && missingCredit.length === 0 && matched.some((s) => s.ec !== undefined) && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden /> Credits match the EC column for every student.</p>
        )}
      </div>

      {unmatched.length > 0 && (
        <details className="rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700"><UserX className="size-4 text-slate-400" aria-hidden />{unmatched.length} rolls not found in our student list — skipped</summary>
          <p className="mt-2 text-xs text-slate-500">Usually students of other colleges on the same sheet. If one of ours is here, check their RU ID in the Academic portal.</p>
          <p className="mt-1 font-mono text-xs text-slate-600">{unmatched.map((s) => s.roll).join(', ')}</p>
        </details>
      )}

      {sheet.merged.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-xs text-sky-900 ring-1 ring-sky-200">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {sheet.merged.length} roll{sheet.merged.length === 1 ? ' appears' : 's appear'} on more than one row (common on retake / improvement sheets) — combined into one student each{sheet.merged.length <= 6 ? `: ${sheet.merged.join(', ')}` : ''}.
        </p>
      )}

      {sheet.problems.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-xl bg-rose-50 p-3 text-xs text-rose-700 ring-1 ring-rose-200">{sheet.problems.map((p) => <p key={p}>{p}</p>)}</div>
      )}

      <Button icon={GraduationCap} loading={isPublishing} disabled={blocked} onClick={handlePublish} className="w-full">
        {matched.length === 0 ? 'None of these rolls are our students' : columns.length === 0 ? 'Switch on at least one course' : `Publish results for ${matched.length} students`}
      </Button>
    </div>
  );
}
