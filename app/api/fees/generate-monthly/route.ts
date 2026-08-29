import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetSemester = body.semester; // This will be 'All' or a number like '3'

    // Start building the query
    let query = supabase.from('master_students').select('id, semester, agreed_monthly_fee');

    // If a specific semester is selected, apply the filter!
    if (targetSemester && targetSemester !== 'All') {
      query = query.eq('semester', parseInt(targetSemester));
    }

    const { data: students, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!students || students.length === 0) {
      return NextResponse.json({ message: 'No students found for this batch.' }, { status: 404 });
    }

    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);
    dueDate.setDate(10); 

    const ledgerEntries = students.map((student) => ({
      student_uuid: student.id,
      semester: student.semester,
      fee_type: 'Monthly',
      total_required: student.agreed_monthly_fee, 
      amount_paid: 0.00,
      due_date: dueDate.toISOString().split('T')[0],
    }));

    const { error: insertError } = await supabase.from('fee_ledger').insert(ledgerEntries);
    if (insertError) throw insertError;

    return NextResponse.json({ 
      success: true, 
      message: `Successfully billed ${students.length} students.` 
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate fees' }, { status: 500 });
  }
}