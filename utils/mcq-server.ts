import type { SupabaseClient } from '@supabase/supabase-js';
import { SUBMIT_GRACE_SECONDS, cleanAnswers, gradeAnswers, type AttemptView, type McqAttempt, type McqExam } from './mcq';

// Server-only helpers for /api/mcq/*. They run with the service-role client, so every route
// checks who is asking before calling them, and nothing here ever sends the answer key to a
// person whose attempt is still running.

export type AttemptRow = McqAttempt & { token: string; mcq_exams: McqExam };

export async function attemptByToken(admin: SupabaseClient, token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const { data } = await admin.from('mcq_attempts').select('*, mcq_exams(*)').eq('token', token).maybeSingle<AttemptRow>();
  return data;
}

// Time is up (deadline + grace passed) or the HOD closed the exam: grade what was saved.
export const isOverdue = (attempt: AttemptRow, now = Date.now()) =>
  attempt.mcq_exams.status === 'closed' || now > new Date(attempt.deadline).getTime() + SUBMIT_GRACE_SECONDS * 1000;

export async function finishAttempt(admin: SupabaseClient, attempt: AttemptRow, answers: (number | null)[], auto: boolean) {
  const questions = attempt.mcq_exams.questions;
  const clean = cleanAnswers(answers, questions);
  const { score, total } = gradeAnswers(questions, clean);
  // Only the first submit counts (submitted_at is null) — a second tab can't overwrite it.
  const { data } = await admin.from('mcq_attempts')
    .update({ answers: clean, score, total, submitted_at: new Date().toISOString(), auto_submitted: auto })
    .eq('id', attempt.id).is('submitted_at', null)
    .select('*, mcq_exams(*)').maybeSingle<AttemptRow>();
  if (data) return data;
  return (await attemptByToken(admin, attempt.token)) ?? attempt;
}

export function attemptView(attempt: AttemptRow): AttemptView {
  const exam = attempt.mcq_exams;
  if (attempt.submitted_at) {
    const picks = cleanAnswers(attempt.answers, exam.questions);
    return {
      state: 'done', title: exam.title, name: attempt.name, roll: attempt.roll,
      score: attempt.score ?? 0, total: attempt.total ?? exam.questions.length,
      auto: attempt.auto_submitted, submittedAt: attempt.submitted_at,
      review: exam.questions.map((q, i) => ({ text: q.text, options: q.options, answer: q.answer, picked: picks[i] })),
    };
  }
  return {
    state: 'running', title: exam.title, name: attempt.name, roll: attempt.roll,
    questions: exam.questions.map((q) => ({ text: q.text, options: q.options })),
    answers: cleanAnswers(attempt.answers, exam.questions),
    deadline: attempt.deadline, now: new Date().toISOString(),
  };
}

// Load → finish if overdue → view. Used by every route that returns an attempt.
export async function currentView(admin: SupabaseClient, attempt: AttemptRow) {
  if (!attempt.submitted_at && isOverdue(attempt)) {
    attempt = await finishAttempt(admin, attempt, attempt.answers, true);
  }
  return attemptView(attempt);
}

// The signed-in student, if any (students skip the password for their own semester's exams).
export async function signedInStudent(supabase: SupabaseClient, admin: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser();
  const meta = user?.app_metadata as { role?: string; student_id?: string } | undefined;
  if (!user || meta?.role !== 'student' || !meta.student_id) return null;
  const { data } = await admin.from('master_students').select('id, name, ru_id, college_id, semester, status')
    .eq('id', meta.student_id).maybeSingle<{ id: string; name: string; ru_id: string | null; college_id: string; semester: number; status: string | null }>();
  return data;
}

export const studentRoll = (s: { ru_id: string | null; college_id: string }) => (s.ru_id || s.college_id).trim();
export const normaliseRoll = (roll: unknown) => (typeof roll === 'string' ? roll.replace(/\s+/g, '').slice(0, 30) : '');
