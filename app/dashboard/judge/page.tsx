'use client';

import JudgeManager from '../../components/judge/JudgeManager';
import { PageHeader } from '../../components/ui';

// HOD: every teacher's coding tests and the problem bank. Only the HOD unblocks students.
export default function JudgePage() {
  return (
    <div>
      <PageHeader title="Coding Tests" description="Online judge: lab tests, exams, assignments, practice and contests in C, C++ and Java. You see every teacher's tests; only you can unblock a student." />
      <JudgeManager />
    </div>
  );
}
