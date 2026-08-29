import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetSemester = body.semester;

    // 1. Fetch the students and their attendance
    let query = supabase.from('master_students')
      .select('id, college_id, attendance_percentage, exam_reg_status');

    if (targetSemester && targetSemester !== 'All') {
      query = query.eq('semester', parseInt(targetSemester));
    }

    const { data: students, error: studentError } = await query;
    if (studentError) throw studentError;
    if (!students || students.length === 0) {
      return NextResponse.json({ message: 'No students found.' }, { status: 404 });
    }

    // 2. Fetch the live financial ledger view to check for dues
    const { data: feeLedger, error: feeError } = await supabase
      .from('student_fee_summary')
      .select('college_id, total_outstanding_due');
    if (feeError) throw feeError;

    let blockedCount = 0;

    // 3. The Autonomous Logic Engine
    for (const student of students) {
      const studentFinances = feeLedger?.find(f => f.college_id === student.college_id);
      
      const hasDues = studentFinances && Number(studentFinances.total_outstanding_due) > 0;
      const lowAttendance = student.attendance_percentage < 75; // Department threshold

      // If they owe money OR have low attendance, block them
      if (hasDues || lowAttendance) {
        if (student.exam_reg_status !== 'Blocked') {
          await supabase
            .from('master_students')
            .update({ exam_reg_status: 'Blocked' })
            .eq('id', student.id);
          blockedCount++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Eligibility check complete. ${blockedCount} students were automatically blocked.` 
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to process eligibility' }, { status: 500 });
  }
}