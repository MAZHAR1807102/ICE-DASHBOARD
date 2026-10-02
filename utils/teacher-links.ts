import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMail } from './mailer';

type Course = { course_code: string; course_name: string; semester: number; credit: number };

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Makes sure the teacher can sign in. New people get the 'teacher' role; existing staff keep theirs.
export async function ensureTeacherAccount(admin: SupabaseClient, email: string, name: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      if (!existing.app_metadata?.role) {
        await admin.auth.admin.updateUserById(existing.id, { app_metadata: { role: 'teacher', name } });
      }
      return;
    }
    if (data.users.length < 1000) break;
  }
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: 'teacher', name } });
  if (error) throw error;
}

// A one-time sign-in link that lands on the teacher portal. Verified by app/auth/confirm.
export async function teacherSignInUrl(admin: SupabaseClient, email: string, origin: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const url = new URL('/auth/confirm', origin);
  url.searchParams.set('token_hash', data.properties.hashed_token);
  url.searchParams.set('type', 'magiclink');
  url.searchParams.set('next', '/teacher');
  return url.toString();
}

export async function sendTeacherLink({ to, name, courses, signInUrl, origin }: {
  to: string;
  name: string;
  courses: Course[];
  signInUrl: string;
  origin: string;
}) {
  const greeting = name ? `Dear ${name},` : 'Dear Instructor,';
  const list = courses.map((c) => `${c.course_code} — ${c.course_name} (Semester ${c.semester}, ${c.credit} credits, ${c.credit === 2 ? 3 : 4} CTs)`);
  const loginUrl = new URL('/teacher-login', origin).toString();

  const text = [
    greeting,
    '',
    courses.length ? 'Please enter the CT marks for your course(s):' : 'Here is your sign-in link for the Teacher Portal.',
    ...list.map((l) => `  • ${l}`),
    '',
    `Open the Teacher Portal: ${signInUrl}`,
    '',
    `This link works once and expires soon. You can always get a new one at ${loginUrl}`,
    '',
    'Best regards,',
    'Department of CSE',
    'Imperial College of Engineering',
  ].join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a">
    <h2 style="margin:0 0 4px">CT marks entry</h2>
    <p style="color:#64748b;margin:0 0 20px">Department of CSE · Imperial College of Engineering</p>
    <p>${escapeHtml(greeting)}</p>
    <p>${courses.length ? 'Please enter the CT marks for your course(s):' : 'Here is your sign-in link for the Teacher Portal.'}</p>
    <ul style="padding-left:18px">${list.map((l) => `<li style="margin-bottom:4px">${escapeHtml(l)}</li>`).join('')}</ul>
    <p style="margin:28px 0">
      <a href="${signInUrl}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Open Teacher Portal</a>
    </p>
    <p style="color:#64748b;font-size:13px">This button signs you in directly and works once. If it has expired, get a new link at
      <a href="${loginUrl}">${loginUrl}</a>.</p>
  </div>`;

  await sendMail({ to, subject: courses.length ? `CT marks entry: ${courses.map((c) => c.course_code).join(', ')}` : 'Your Teacher Portal sign-in link', text, html });
}
