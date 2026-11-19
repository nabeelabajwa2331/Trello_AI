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

export type Mail = { to: string; subject: string; text: string; html: string };

/** Exposed as an object so tests can capture mail instead of sending it. */
export const mailer = {
  async send(m: Mail) {
    if (!transport) {
      // No SMTP configured: print it so the link can still be used.
      console.log(`\n[mail not configured] To: ${m.to}\nSubject: ${m.subject}\n${m.text}\n`);
      return;
    }
    await transport.sendMail({ from: env.smtp.from, ...m });
  },
};

/** Sends without failing the request: a missing email shouldn't undo a signup or an invite. */
export async function sendQuietly(m: Mail) {
  try {
    await mailer.send(m);
    return true;
  } catch (e) {
    console.error(`Could not send "${m.subject}" to ${m.to}:`, e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const first = (name: string) => name.split(/\s+/)[0] || 'there';

/** Shared look for every email: beige page, card, yellow button. */
function layout(o: { heading: string; intro: string; button: string; link: string; footnote: string }) {
  return `<div style="font-family:Arial,sans-serif;background:#EEE9DF;padding:32px 16px;color:#2A2926">
  <div style="max-width:480px;margin:0 auto;background:#FAF8F4;border:1px solid #2A2926;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-weight:800;font-size:18px">Crewboard</p>
    <h1 style="font-size:22px;margin:16px 0 8px">${esc(o.heading)}</h1>
    <p style="line-height:1.5">${o.intro}</p>
    <p style="margin:24px 0"><a href="${esc(o.link)}" style="background:#F4C430;color:#2A2926;border:1px solid #2A2926;border-radius:8px;padding:12px 20px;text-decoration:none;font-weight:700;display:inline-block">${esc(o.button)}</a></p>
    <p style="line-height:1.5;color:#6E6A62;font-size:13px">${esc(o.footnote)}</p>
    <p style="color:#6E6A62;font-size:12px;word-break:break-all">${esc(o.link)}</p>
  </div>
</div>`;
}

export function resetEmail(name: string, link: string): Omit<Mail, 'to'> {
  const footnote = "The link works once and expires in 1 hour. If you didn't ask for this, ignore this email; your password stays the same.";
  return {
    subject: 'Reset your Crewboard password',
    text: `Hi ${first(name)},\n\nSomeone asked to reset the password for your Crewboard account. Open this link to choose a new one:\n\n${link}\n\n${footnote}\n\nCrewboard`,
    html: layout({ heading: 'Reset your password', intro: `Hi ${esc(first(name))}, someone asked to reset the password for your Crewboard account. Choose a new one with the button below.`, button: 'Choose a new password', link, footnote }),
  };
}

export function verifyEmail(name: string, link: string): Omit<Mail, 'to'> {
  const footnote = "The link expires in 24 hours. If you didn't create a Crewboard account, ignore this email.";
  return {
    subject: 'Confirm your email for Crewboard',
    text: `Hi ${first(name)},\n\nConfirm this is your email address so teammates can invite you to their boards:\n\n${link}\n\n${footnote}\n\nCrewboard`,
    html: layout({ heading: 'Confirm your email', intro: `Hi ${esc(first(name))}, confirm this is your email address so teammates can invite you to their boards.`, button: 'Confirm my email', link, footnote }),
  };
}

export function inviteEmail(inviter: string, boardTitle: string, role: string, link: string, hasAccount: boolean): Omit<Mail, 'to'> {
  const action = hasAccount ? 'Log in and open your boards to accept it.' : 'Create a free account with this email address to accept it.';
  const footnote = "If you don't know this person, ignore this email. Nobody gets access to anything unless you accept.";
  return {
    subject: `${inviter} invited you to “${boardTitle}” on Crewboard`,
    text: `${inviter} invited you to the board “${boardTitle}” as ${role}.\n\n${action}\n\n${link}\n\n${footnote}\n\nCrewboard`,
    html: layout({
      heading: `You're invited to “${boardTitle}”`,
      intro: `<b>${esc(inviter)}</b> invited you to the board <b>“${esc(boardTitle)}”</b> as <b>${esc(role)}</b>. ${esc(action)}`,
      button: hasAccount ? 'Open Crewboard' : 'Create my account',
      link,
      footnote,
    }),
  };
}
