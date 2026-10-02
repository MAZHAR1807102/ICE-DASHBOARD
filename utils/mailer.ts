import nodemailer from 'nodemailer';

// Department Gmail account (EMAIL_USER / EMAIL_PASS in the environment). Server-only.
export function sendMail(options: { to: string; subject: string; text: string; html?: string; attachments?: { filename: string; content: string }[] }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return transporter.sendMail({ from: `"CSE Academic Coordination" <${process.env.EMAIL_USER}>`, ...options });
}
