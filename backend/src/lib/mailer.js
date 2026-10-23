// Mailer — nodemailer when SMTP is configured, console stub otherwise.
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!to || !subject) throw new Error('to and subject required');
  const t = getTransporter();
  const from = process.env.MAIL_FROM || 'no-reply@tockinax.local';
  if (!t) {
    console.log(`[mail stub] from=${from} to=${to} subject=${subject} text=${(text || '').slice(0, 200)}`);
    return { stub: true, to, subject };
  }
  return t.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail };
