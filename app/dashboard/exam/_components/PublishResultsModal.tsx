'use client';

import { useState } from 'react';
import { Download, GraduationCap, Upload } from 'lucide-react';
import Modal from '../../../components/Modal';
import { Button, inputClass } from '../../../components/ui';
import { useConfirm, useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { downloadCsv, parseCsv, toCsv } from '../../../../utils/csv';
import { GRADES } from '../../../../utils/grades';
import { SEMESTERS, type Course, type Student } from '../../../../utils/types';

type ResultRow = { student_id: string; semester: number; course_code: string; course_name: string; credit: number; grade: string };
type Preview = { rows: ResultRow[]; problems: string[]; skippedBlank: number };

const HEADER = ['College ID', 'RU ID', 'Name', 'Course Code', 'Course Title', 'Credit', 'Grade'];

// Template rows: every student of the semester × every course of the semester; Grade left blank.
export default function PublishResultsModal({ students, onClose, onPublished }: {
  students: Pick<Student, 'id' | 'college_id' | 'ru_id' | 'name' | 'semester'>[];
  onClose: () => void;
  onPublished: (message: string) => void;
}) {
  const [semester, setSemester] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const coursesFor = async (sem: number) => {
    const { data, error } = await supabase.from('courses').select('*').eq('semester', sem).order('course_code');
    if (error) throw error;
    return (data ?? []) as Course[];
  };

  const handleTemplate = async () => {
    const courses = await coursesFor(semester);
    if (courses.length === 0) return toast.error(`No courses are set up for semester ${semester}. Add them in the Academic portal first.`);
    const cohort = students.filter((s) => s.semester === semester);
    const rows = cohort.flatMap((s) => courses.map((c) => [s.college_id, s.ru_id || '', s.name, c.course_code, c.course_name, c.credit, '']));
    downloadCsv(`Results_Semester_${semester}.csv`, toCsv(HEADER, rows));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsWorking(true);
    const courses = await coursesFor(semester);
    const rows: ResultRow[] = [];
    const problems: string[] = [];
    let skippedBlank = 0;

    parseCsv(await file.text()).slice(1).forEach((cols, i) => {
      const line = i + 2;
      const [collegeId, , , rawCode, rawTitle, rawCredit, rawGrade] = cols.map((c) => c?.trim() ?? '');
      const grade = rawGrade.toUpperCase();
      if (!grade) { skippedBlank++; return; }

      const student = students.find((s) => s.college_id === collegeId);
      const course = courses.find((c) => c.course_code.toLowerCase() === rawCode.toLowerCase());
      const credit = Number(rawCredit) || course?.credit || 0;

      if (!student) return problems.push(`Line ${line}: no student with College ID "${collegeId}"`);
      if (!rawCode) return problems.push(`Line ${line}: missing course code`);
      if (!GRADES.includes(grade)) return problems.push(`Line ${line}: "${rawGrade}" is not a valid grade (use ${GRADES.join(', ')})`);
      if (credit <= 0) return problems.push(`Line ${line}: missing credit for ${rawCode}`);

      rows.push({ student_id: student.id, semester, course_code: course?.course_code ?? rawCode, course_name: course?.course_name ?? rawTitle, credit, grade });
    });

    setPreview({ rows, problems, skippedBlank });
    setIsWorking(false);
  };

  const handlePublish = async () => {
    if (!preview || preview.rows.length === 0) return;
    if (!(await confirm({ title: `Publish ${preview.rows.length} results for semester ${semester}?`, body: 'Students see them immediately. Existing grades for the same course and semester are replaced.', confirmLabel: 'Publish' }))) return;

    setIsWorking(true);
    const { error } = await supabase.from('course_results').upsert(preview.rows, { onConflict: 'student_id,semester,course_code' });
    setIsWorking(false);
    if (error) return toast.error(`Results not published: ${error.message}`);
    onPublished(`Published ${preview.rows.length} results for semester ${semester}.`);
  };

  const studentCount = preview ? new Set(preview.rows.map((r) => r.student_id)).size : 0;

  return (
    <Modal title="Publish semester results" description="Students see published grades on their profile immediately." size="lg" onClose={onClose}>
      <div className="space-y-5">
        <ol className="space-y-2 text-sm text-slate-600">
          {['Choose the semester and download the template.', `Fill in the Grade column (${GRADES.join(', ')}). Leave it blank to skip a row.`, 'Upload the file, check the preview, then publish.'].map((step, i) => (
            <li key={i} className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{i + 1}</span>{step}</li>
          ))}
        </ol>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={semester} onChange={(e) => { setSemester(Number(e.target.value)); setPreview(null); }} className={`${inputClass} sm:w-40`} aria-label="Semester">
            {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
          <Button variant="secondary" icon={Download} onClick={handleTemplate}>Download template</Button>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
            <Upload className="size-4" aria-hidden /> Upload filled CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>

        {isWorking && !preview && <p className="text-sm text-slate-500">Reading file…</p>}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200"><p className="text-2xl font-bold text-emerald-700">{preview.rows.length}</p><p className="text-xs font-medium text-emerald-700">grades ready</p></div>
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-2xl font-bold text-slate-700">{studentCount}</p><p className="text-xs font-medium text-slate-500">students</p></div>
              <div className={`rounded-xl p-3 ring-1 ${preview.problems.length ? 'bg-rose-50 ring-rose-200' : 'bg-slate-50 ring-slate-200'}`}><p className={`text-2xl font-bold ${preview.problems.length ? 'text-rose-700' : 'text-slate-700'}`}>{preview.problems.length}</p><p className="text-xs font-medium text-slate-500">problems</p></div>
            </div>
            {preview.skippedBlank > 0 && <p className="text-xs text-slate-500">{preview.skippedBlank} rows with no grade were skipped.</p>}
            {preview.problems.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
                <p className="mb-1 text-xs font-semibold text-rose-800">These rows won&apos;t be published — fix them and upload again:</p>
                <ul className="space-y-0.5 text-xs text-rose-700">{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <Button icon={GraduationCap} loading={isWorking} disabled={preview.rows.length === 0} onClick={handlePublish} className="w-full">
              Publish {preview.rows.length} results
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
