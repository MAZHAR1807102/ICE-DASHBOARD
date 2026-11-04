'use client';

import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import { useToast } from '../../../components/Providers';
import { supabase } from '../../../../utils/supabase';
import { isActive, type Course, type Student } from '../../../../utils/types';
import AttendanceSheetModal from '../../academic/_components/AttendanceSheetModal';

// Exams → Documents → Attendance sheet: the same sheet as Academic's, loading what it needs first.
export default function ExamAttendanceSheet({ initialSemester, onClose }: { initialSemester: number; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ students: Student[]; courses: Course[] } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('master_students').select('*'),
      supabase.from('courses').select('*').order('semester', { ascending: true }),
    ]).then(([s, c]) => {
      if (s.error || c.error) { toast.error(`Could not load data: ${(s.error ?? c.error)!.message}`); return onClose(); }
      setData({ students: (s.data as Student[]).filter(isActive), courses: c.data as Course[] });
    });
  }, [toast, onClose]);

  if (!data) return <Modal title="Attendance sheet" onClose={onClose}><p className="py-6 text-center text-sm text-slate-500">Loading students and courses…</p></Modal>;
  return <AttendanceSheetModal students={data.students} courses={data.courses} initialSemester={initialSemester} onClose={onClose} />;
}
