import { NextResponse } from 'next/server';
import { requireRole } from '../../../../utils/supabase-server';
import { isExamEligible } from '../../../../utils/eligibility';

export async function POST(request: Request) {
  const auth = await requireRole(['exam', 'hod']);
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  try {
    const body = await request.json();
    const targetSemester = body.semester;

    // 1. Fetch the students with their attendance and balances
    let query = supabase.from('master_students')
      .select('id, attendance_percentage, exam_reg_status, eligibility_override, monthly_due, semester_due, exam_due, attendance_fine');

    if (targetSemester && targetSemester !== 'All') {
      query = query.eq('semester', parseInt(targetSemester));
    }

    const { data: students, error: studentError } = await query;
    if (studentError) throw studentError;
    if (!students || students.length === 0) {
      return NextResponse.json({ message: 'No students found.' }, { status: 404 });
    }

    // 2. Apply the department rule (see utils/eligibility.ts)
    const toBlock = students
      .filter(s => s.exam_reg_status !== 'Blocked')
      .filter(s => !isExamEligible({
        attendance_percentage: s.attendance_percentage,
        eligibility_override: s.eligibility_override,
        total_due: (s.monthly_due || 0) + (s.semester_due || 0) + (s.exam_due || 0) + (s.attendance_fine || 0),
      }))
      .map(s => s.id);

    // 3. Block them in a single update
    if (toBlock.length > 0) {
      const { error: updateError } = await supabase
        .from('master_students')
        .update({ exam_reg_status: 'Blocked' })
        .in('id', toBlock);
      if (updateError) throw updateError;
    }
    const blockedCount = toBlock.length;

    return NextResponse.json({ 
      success: true, 
      message: `Eligibility check complete. ${blockedCount} students were automatically blocked.` 
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to process eligibility' }, { status: 500 });
  }
}