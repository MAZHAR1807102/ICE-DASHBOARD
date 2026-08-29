import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetSemester = body.semester;

    let query = supabase.from('master_students').select('id, semester, agreed_ru_exam_fee');

    if (targetSemester && targetSemester !== 'All') {
      query = query.eq('semester', parseInt(targetSemester));
    }

    const { data: students, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!students || students.length === 0) return NextResponse.json({ message: 'No students found for this batch.' }, { status: 404 });

    const ledgerEntries = students.map((student) => ({
      student_uuid: student.id,
      semester: student.semester,
      fee_type: 'RU Exam',
      total_required: student.agreed_ru_exam_fee, 
      amount_paid: 0.00,
    }));

    const { error: insertError } = await supabase.from('fee_ledger').insert(ledgerEntries);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, message: `Successfully billed ${students.length} students.` }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate RU Exam fees' }, { status: 500 });
  }
}