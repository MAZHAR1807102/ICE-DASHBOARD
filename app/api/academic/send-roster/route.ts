import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireRole } from '../../../../utils/supabase-server';

export async function POST(request: Request) {
  const auth = await requireRole(['academic', 'hod']);
  if ('error' in auth) return auth.error;

  try {
    const { teacherEmail, teacherName, courseCode, courseName, csvData, type, sheetUrl } = await request.json();

    if (!teacherEmail || !courseCode || !csvData) {
      return NextResponse.json({ error: 'Missing required data.' }, { status: 400 });
    }

    const isAttendance = type === 'attendance';
    const sheetName = isAttendance ? 'Attendance Sheet' : 'Grading Sheet';
    const instructions = isAttendance
      ? 'Please fill in "Total Classes Held" and "Classes Attended" for each student'
      : 'Please fill out the CT marks in the provided columns';
    const sheetLine = isAttendance && sheetUrl ? `\n\nShared attendance sheet: ${sheetUrl}` : '';

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"CSE Academic Coordination" <${process.env.EMAIL_USER}>`,
      to: teacherEmail,
      subject: `${sheetName}: ${courseCode} - ${courseName}`,
      text: `Dear ${teacherName || 'Instructor'},\n\nPlease find attached the ${sheetName.toLowerCase()} for ${courseCode} (${courseName}).\n\n${instructions} and return the CSV file to the Academic Coordinator for direct system upload.${sheetLine}\n\nBest regards,\nDepartment of CSE\nImperial College of Engineering`,
      attachments: [
        {
          filename: `${courseCode}_${sheetName.replace(' ', '_')}.csv`,
          content: csvData,
        },
      ],
    });

    return NextResponse.json({ success: true, message: `Email successfully sent to ${teacherEmail}` }, { status: 200 });
  } catch (error) {
    console.error('Email error:', error);
    return NextResponse.json({ error: 'Failed to send email. Check your SMTP credentials.' }, { status: 500 });
  }
}
