import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '../../../../utils/supabase-admin';
import { requireRole } from '../../../../utils/supabase-server';
import { attemptByToken } from '../../../../utils/mcq-server';
import { validOrder } from '../../../../utils/mcq';

// Question pictures (cut from the uploaded PDF) live in a private storage bucket, one folder per
// exam (its link code). Only the HOD uploads/deletes; a person taking the exam gets the pictures
// of their own attempt through its token. The bucket is created the first time it is needed.
const BUCKET = 'mcq-images';
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const FOLDER = /^[a-z0-9]{6,16}$/;
const PATH = /^[a-z0-9]{6,16}\/[a-f0-9]{16,40}\.(?:webp|png|jpg)$/;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function send(admin: SupabaseClient, path: string) {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return fail('Picture not found.', 404);
  // A path never changes content (new pictures get new names), so the browser may keep it.
  return new Response(data, { headers: { 'Content-Type': data.type || 'image/webp', 'Cache-Control': 'private, max-age=86400, immutable' } });
}

// GET ?token=…&q=k — question k as this person sees it (their shuffled order).
// GET ?path=…       — HOD only (the editor).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const admin = createAdminClient();
  if (params.has('token')) {
    const attempt = await attemptByToken(admin, params.get('token'));
    if (!attempt) return fail('Exam attempt not found.', 404);
    const questions = attempt.mcq_exams.questions;
    const k = Number(params.get('q'));
    if (!Number.isInteger(k) || k < 0 || k >= questions.length) return fail('No such question.', 404);
    const image = questions[validOrder(attempt.question_order, questions.length)[k]].image;
    return image && PATH.test(image.path) ? send(admin, image.path) : fail('This question has no picture.', 404);
  }
  const auth = await requireRole(['hod']);
  if ('error' in auth) return auth.error;
  const path = params.get('path') ?? '';
  return PATH.test(path) ? send(admin, path) : fail('Picture not found.', 404);
}

// POST ?folder=<exam code>, body = the picture — HOD only. Returns its storage path.
export async function POST(request: Request) {
  const auth = await requireRole(['hod']);
  if ('error' in auth) return auth.error;
  const folder = new URL(request.url).searchParams.get('folder') ?? '';
  const ext = TYPES[request.headers.get('content-type') ?? ''];
  if (!FOLDER.test(folder) || !ext) return fail('Send a WebP, PNG or JPEG picture.');
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_BYTES) return fail('The picture is too large.');

  const admin = createAdminClient();
  const path = `${folder}/${randomBytes(12).toString('hex')}.${ext}`;
  const upload = () => admin.storage.from(BUCKET).upload(path, body, { contentType: request.headers.get('content-type')!, upsert: false });
  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(TYPES) });
    ({ error } = await upload());
  }
  if (error) {
    console.error('mcq image upload', error);
    return fail('Could not save the picture. Try again.', 500);
  }
  return NextResponse.json({ path });
}

// DELETE { paths } or { folder } — HOD only: pictures no longer used, or a deleted exam's folder.
export async function DELETE(request: Request) {
  const auth = await requireRole(['hod']);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  let paths: string[] = Array.isArray(body.paths) ? body.paths.filter((p: unknown) => typeof p === 'string' && PATH.test(p)) : [];
  if (typeof body.folder === 'string' && FOLDER.test(body.folder)) {
    const { data } = await admin.storage.from(BUCKET).list(body.folder, { limit: 1000 });
    paths = [...paths, ...(data ?? []).map((f) => `${body.folder}/${f.name}`)];
  }
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  return NextResponse.json({ removed: paths.length });
}
