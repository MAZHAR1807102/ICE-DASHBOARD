'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, GraduationCap, Sparkles, UserX } from 'lucide-react';
import { supabase } from '../../../../utils/supabase';
import { inferCredits, parseResultSheet, type ParsedSheet } from '../../../../utils/result-sheet';
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
  const [credits, setCredits] = useState<Record<string, string>>({});
  const [suggested, setSuggested] = useState<Record<string, number>>({});
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
      const inferred = inferCredits(parsed);
      setSuggested(inferred);
      setCredits(Object.fromEntries(parsed.courses.map((code) => {
        const known = catalog.find((c) => c.course_code.toUpperCase() === code);
        return [code, String(inferred[code] ?? known?.credit ?? '')];
      })));
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
  const absent = matched.filter((s) => sheet!.courses.every((c) => !s.grades[c]));
  const gradeCount = matched.reduce((n, s) => n + sheet!.courses.filter((c) => s.grades[c]).length, 0);
  const missingCredit = sheet ? sheet.courses.filter((c) => !(Number(credits[c]) > 0)) : [];

  // Students whose credits (excluding F) don't add up to the EC printed on the sheet.
  const ecMismatches = sheet && missingCredit.length === 0
    ? matched.filter((s) => {
        if (s.ec === undefined || sheet.courses.some((c) => !s.grades[c])) return false;
        const earned = sheet.courses.filter((c) => s.grades[c] !== 'F').reduce((sum, c) => sum + Number(credits[c]), 0);
        return Math.abs(earned - s.ec) > 0.01;
      })
    : [];

  const handlePublish = async () => {
    if (!sheet || matched.length === 0) return;
    const ok = await confirm({
      title: `Publish semester ${semester} results for ${matched.length} students?`,
      body: `${gradeCount} course grades${sheet.hasOfficialFigures ? ' plus the official EC, GPA, YGPA, result and merit' : ''}. Students see them immediately. Grades already published for the same course and semester are replaced.`,
      confirmLabel: 'Publish results',
    });
    if (!ok) return;

    setIsPublishing(true);
    const courseRows = matched.flatMap((s) => sheet.courses.filter((c) => s.grades[c]).map((code) => ({
      student_id: byRoll.get(s.roll)!.id,
      semester,
      course_code: code,
      course_name: catalog.find((c) => c.course_code.toUpperCase() === code)?.course_name ?? null,
      credit: Number(credits[code]),
      grade: s.grades[code],
    })));
    const { error: courseError } = courseRows.length
      ? await supabase.from('course_results').upsert(courseRows, { onConflict: 'student_id,semester,course_code' })
      : { error: null };

    let summaryError = null;
    if (!courseError && sheet.hasOfficialFigures) {
      const summaryRows = matched.map((s) => ({
        student_id: byRoll.get(s.roll)!.id,
        semester,
        exam_title: sheet.title || null,
        earned_credits: s.ec ?? null,
        gpa: s.gpa ?? null,
        year_earned_credits: s.yec ?? null,
        ygpa: s.ygpa ?? null,
        result_status: s.result ?? null,
        merit_position: s.merit ?? null,
      }));
      ({ error: summaryError } = await supabase.from('semester_results').upsert(summaryRows, { onConflict: 'student_id,semester' }));
    }
    setIsPublishing(false);

    const failure = courseError ?? summaryError;
    if (failure) return toast.error(`Results not published: ${failure.message}`);
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
        <p className="mb-2 text-sm font-semibold text-slate-900">Course credits</p>
        <div className={`${table.wrap} rounded-xl ring-1 ring-slate-200`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr><th className={table.th}>Course</th><th className={`${table.th} w-28`}>Credit</th></tr>
            </thead>
            <tbody className={table.body}>
              {sheet.courses.map((code) => {
                const known = catalog.find((c) => c.course_code.toUpperCase() === code);
                const guess = suggested[code];
                return (
                  <tr key={code}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{code}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {known?.course_name ?? 'Not in the course list'}
                        {guess !== undefined && <Badge tone="violet"><Sparkles className="size-3" aria-hidden />{guess} from EC</Badge>}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number" step="0.25" min="0" value={credits[code] ?? ''} aria-label={`Credit for ${code}`}
                        onChange={(e) => setCredits({ ...credits, [code]: e.target.value })}
                        className={cx(inputClass, 'h-8 text-center', !(Number(credits[code]) > 0) && 'ring-rose-400')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {missingCredit.length > 0 && <p className="mt-2 text-xs text-rose-600">Enter the credit for {missingCredit.join(', ')}.</p>}
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

      {sheet.problems.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-xl bg-rose-50 p-3 text-xs text-rose-700 ring-1 ring-rose-200">{sheet.problems.map((p) => <p key={p}>{p}</p>)}</div>
      )}

      <Button icon={GraduationCap} loading={isPublishing} disabled={matched.length === 0 || missingCredit.length > 0} onClick={handlePublish} className="w-full">
        {matched.length === 0 ? 'None of these rolls are our students' : `Publish results for ${matched.length} students`}
      </Button>
    </div>
  );
}
