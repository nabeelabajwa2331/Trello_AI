import nodemailer from 'nodemailer';
import { env } from './env.js';

const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export const mailEnabled = !!transport;

type Mail = { to: string; subject: string; text: string; html: string };

/** Exposed as an object so tests can capture mail instead of sending it. */
export const mailer = {
  async send(m: Mail) {
    if (!transport) {
      // No SMTP configured: print it so the link can still be used during development.
      console.log(`\n[mail not configured] To: ${m.to}\nSubject: ${m.subject}\n${m.text}\n`);
      return;
    }
    await transport.sendMail({ from: env.smtp.from, ...m });
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function resetEmail(name: string, link: string): Omit<Mail, 'to'> {
  const first = name.split(/\s+/)[0] || 'there';
  return {
    subject: 'Reset your Crewboard password',
    text: `Hi ${first},\n\nSomeone asked to reset the password for your Crewboard account. Open this link to choose a new one:\n\n${link}\n\nThe link works once and expires in 1 hour. If you didn't ask for this, ignore this email; your password stays the same.\n\nCrewboard`,
    html: `<div style="font-family:Arial,sans-serif;background:#EEE9DF;padding:32px 16px;color:#2A2926">
  <div style="max-width:480px;margin:0 auto;background:#FAF8F4;border:1px solid #2A2926;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-weight:800;font-size:18px">Crewboard</p>
    <h1 style="font-size:22px;margin:16px 0 8px">Reset your password</h1>
    <p style="line-height:1.5">Hi ${esc(first)}, someone asked to reset the password for your Crewboard account. Choose a new one with the button below.</p>
    <p style="margin:24px 0"><a href="${esc(link)}" style="background:#F4C430;color:#2A2926;border:1px solid #2A2926;border-radius:8px;padding:12px 20px;text-decoration:none;font-weight:700;display:inline-block">Choose a new password</a></p>
    <p style="line-height:1.5;color:#6E6A62;font-size:13px">The link works once and expires in 1 hour. If you didn't ask for this, ignore this email; your password stays the same.</p>
    <p style="color:#6E6A62;font-size:12px;word-break:break-all">${esc(link)}</p>
  </div>
</div>`,
  };
}
