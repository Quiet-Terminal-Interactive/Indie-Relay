import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const from = process.env.EMAIL_FROM ?? 'Indie Relay <noreply@indierelay.co.uk>';
  const transport = getTransporter();

  try {
    await transport.sendMail({ from, to, subject, text });
  } catch (err) {
    console.error('Email send failed:', err);
  }
}
