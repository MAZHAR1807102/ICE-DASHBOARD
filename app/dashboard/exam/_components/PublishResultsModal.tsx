'use client';

import { useState } from 'react';
import Modal from '../../../components/Modal';
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

  const coursesFor = async (sem: number) => {
    const { data, error } = await supabase.from('courses').select('*').eq('semester', sem).order('course_code');
    if (error) throw error;
    return (data ?? []) as Course[];
  };

  const handleTemplate = async () => {
    const courses = await coursesFor(semester);
    if (courses.length === 0) return alert(`No courses are set up for semester ${semester}. Add them in the Academic portal first.`);
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
    if (!window.confirm(`Publish ${preview.rows.length} results for semester ${semester}?\n\nStudents will see them immediately. Existing grades for the same course and semester are replaced.`)) return;

    setIsWorking(true);
    const { error } = await supabase.from('course_results').upsert(preview.rows, { onConflict: 'student_id,semester,course_code' });
    setIsWorking(false);
    if (error) return alert(`Results not published: ${error.message}`);
    onPublished(`Published ${preview.rows.length} results for semester ${semester}.`);
  };

  const studentCount = preview ? new Set(preview.rows.map((r) => r.student_id)).size : 0;

  return (
    <Modal title="Publish Semester Results" size="lg" onClose={onClose}>
      <div className="space-y-5">
        <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
          <li>Choose the semester and download the template.</li>
          <li>Fill in the <b>Grade</b> column ({GRADES.join(', ')}). Leave it blank to skip a row.</li>
          <li>Upload the file, check the preview, then publish.</li>
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={semester}
            onChange={(e) => { setSemester(Number(e.target.value)); setPreview(null); }}
            className="border border-slate-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500"
          >
            {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
          <button onClick={handleTemplate} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50">⬇️ Download Template</button>
          <label className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 cursor-pointer">
            ⬆️ Upload Filled CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>

        {isWorking && <p className="text-sm text-slate-500">Working...</p>}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-2xl font-black text-emerald-700">{preview.rows.length}</p>
                <p className="text-xs font-bold text-emerald-700">grades ready</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-2xl font-black text-slate-700">{studentCount}</p>
                <p className="text-xs font-bold text-slate-500">students</p>
              </div>
              <div className={`rounded-lg p-3 border ${preview.problems.length ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-2xl font-black ${preview.problems.length ? 'text-rose-700' : 'text-slate-700'}`}>{preview.problems.length}</p>
                <p className="text-xs font-bold text-slate-500">problems</p>
              </div>
            </div>
            {preview.skippedBlank > 0 && <p className="text-xs text-slate-500">{preview.skippedBlank} rows with no grade were skipped.</p>}
            {preview.problems.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-rose-800 mb-1">These rows will not be published — fix them and upload again:</p>
                <ul className="text-xs text-rose-700 space-y-0.5">{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <button
              onClick={handlePublish}
              disabled={isWorking || preview.rows.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Publish {preview.rows.length} Results
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
