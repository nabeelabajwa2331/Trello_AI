import { Router, type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './env.js';
import { HttpError, appOrigin, handle, parse } from './http.js';
import { mailEnabled, mailer, resetEmail, sendQuietly, verifyEmail } from './mail.js';
import { disconnectSession, disconnectUser } from './realtime.js';

export const COOKIE = 'cb_token';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const AVATAR_COLORS = ['#A8574A', '#5E7D57', '#4F6C86', '#7D6688', '#A8642F', '#4C7A75', '#8A8378'];

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
    sessionId: string;
  }
}

type UserRow = { id: string; name: string; email: string; color: string; avatarUrl?: string | null; emailVerifiedAt?: Date | null };
export const publicUser = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  color: u.color,
  avatarUrl: u.avatarUrl ?? null,
  emailVerified: !!u.emailVerifiedAt,
});

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/* ------------------------------------------------------------------ sessions */

/** The cookie holds a signed token naming a row in the Session table. */
export async function sessionFromToken(token: string | undefined): Promise<{ userId: string; sessionId: string } | null> {
  if (!token) return null;
  let claims: { sub?: string; sid?: string };
  try {
    claims = jwt.verify(token, env.jwtSecret) as typeof claims;
  } catch {
    return null;
  }
  if (!claims.sub || !claims.sid) return null;
  const s = await prisma.session.findUnique({ where: { id: claims.sid }, include: { user: { select: { suspendedAt: true } } } });
  if (!s || s.userId !== claims.sub || s.expiresAt.getTime() < Date.now() || s.user.suspendedAt) return null;
  return { userId: s.userId, sessionId: s.id };
}

/** The built-in password-only admin account from SITE_ADMIN_EMAIL / SITE_ADMIN_PASSWORD. */
const isSiteAdminAccount = (email: string) => !!env.siteAdmin.email && email.toLowerCase() === env.siteAdmin.email;

/** Site admins: listed in ADMIN_EMAILS with a confirmed email (so nobody can sign up as one), or the built-in SITE_ADMIN account. */
export const isAdmin = (u: { email: string; emailVerifiedAt?: Date | null; suspendedAt?: Date | null }) =>
  !!u.emailVerifiedAt && !u.suspendedAt && (env.adminEmails.has(u.email.toLowerCase()) || isSiteAdminAccount(u.email));

/** Creates or updates the built-in admin on every start, from SITE_ADMIN_EMAIL / SITE_ADMIN_PASSWORD. */
export async function ensureSiteAdmin() {
  const { email, password, name } = env.siteAdmin;
  if (!email) return;
  if (!password) {
    console.log(`No SITE_ADMIN_PASSWORD set, so the built-in admin (${email}) is not active.`);
    return;
  }
  if (password.length < 12) {
    console.error('SITE_ADMIN_PASSWORD must be at least 12 characters. The site admin account was not set up.');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10), color: '#2A2926', emailVerifiedAt: new Date() },
    });
    console.log(`Site admin account created: ${email}`);
    return;
  }
  const same = !!existing.passwordHash && (await bcrypt.compare(password, existing.passwordHash));
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash: same ? undefined : await bcrypt.hash(password, 10),
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      googleId: null, // password-only: never linked to whoever owns that address at Google
      suspendedAt: null,
    },
  });
  if (!same) {
    await endAllSessions(existing.id);
    console.log(`Site admin password updated for ${email}; old sessions ended.`);
  }
}

/** Listed in ADMIN_EMAILS but the email isn't confirmed yet: the app tells them why there's no admin panel. */
export const isPendingAdmin = (u: { email: string; emailVerifiedAt?: Date | null }) =>
  !u.emailVerifiedAt && env.adminEmails.has(u.email.toLowerCase());

const SUSPENDED = 'This account has been suspended. If you think this is a mistake, contact the site admin.';

/** Used by the admin panel. */
export { endAllSessions, sendVerification };

async function startSession(req: Request, res: Response, userId: string) {
  const s = await prisma.session.create({
    data: { userId, userAgent: req.get('user-agent')?.slice(0, 200), expiresAt: new Date(Date.now() + WEEK) },
  });
  const token = jwt.sign({ sub: userId, sid: s.id }, env.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProd, maxAge: WEEK, path: '/' });
}

/** Ends every session of a user (password reset, "log out everywhere", account taken back via Google). */
async function endAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
  disconnectUser(userId);
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  sessionFromToken(req.cookies?.[COOKIE])
    .then((s) => {
      if (!s) return next(new HttpError(401, 'Your session ended. Log in again.'));
      req.userId = s.userId;
      req.sessionId = s.sessionId;
      next();
    })
    .catch(next);
}

/* ------------------------------------------------------------------ rate limits */

const limiter = (limit: number, minutes: number, error: string) =>
  rateLimit({
    windowMs: minutes * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, res) => res.status(429).json({ error }),
  });

/** Per IP address: logins, signups, Google, password resets, email confirmation. */
const authLimit = limiter(30, 15, 'Too many attempts from your network. Wait 15 minutes and try again.');
/** Per IP address: anything that sends an email. */
const emailLimit = limiter(6, 15, 'Too many emails requested. Wait 15 minutes and try again.');

/** Per account: after 8 wrong passwords in 15 minutes, that email is locked for the rest of the window. */
const failedLogins = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILED = 8;
function checkLock(email: string) {
  const f = failedLogins.get(email);
  if (f && f.resetAt > Date.now() && f.count >= MAX_FAILED) {
    const mins = Math.ceil((f.resetAt - Date.now()) / 60_000);
    throw new HttpError(
      429,
      `Too many wrong passwords for this account. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.`,
    );
  }
}
function recordFailure(email: string) {
  const f = failedLogins.get(email);
  if (!f || f.resetAt < Date.now()) failedLogins.set(email, { count: 1, resetAt: Date.now() + 15 * 60_000 });
  else f.count++;
}

/* ------------------------------------------------------------------ email verification */

const VERIFY_TTL = 24 * 60 * 60 * 1000;

async function sendVerification(req: Request, user: { id: string; name: string; email: string }) {
  await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
  const token = newToken();
  await prisma.emailVerification.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL) },
  });
  return sendQuietly({ to: user.email, ...verifyEmail(user.name, `${appOrigin(req)}/verify-email?token=${token}`) });
}

/* ------------------------------------------------------------------ Google */

type GoogleProfile = { sub: string; email: string; name: string; picture?: string };

const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

/** Exposed as an object so tests can replace it. */
export const google = {
  /** ID token from Google's own button. */
  async verify(credential: string): Promise<GoogleProfile> {
    if (!googleClient) throw new HttpError(503, 'Google sign-in is not set up on this server.');
    let p;
    try {
      p = (await googleClient.verifyIdToken({ idToken: credential, audience: env.googleClientId })).getPayload();
    } catch {
      throw new HttpError(401, "Couldn't verify your Google sign-in. Try again.");
    }
    if (!p?.sub || !p.email) throw new HttpError(401, "Google didn't share an email address for this account.");
    if (!p.email_verified) throw new HttpError(401, 'Verify your email address with Google first, then try again.');
    return { sub: p.sub, email: p.email.toLowerCase(), name: p.name?.trim() || p.email.split('@')[0], picture: p.picture };
  },

  /** Access token from our styled button. Accepted only if Google says it was issued to our Client ID. */
  async verifyAccessToken(accessToken: string): Promise<GoogleProfile> {
    if (!env.googleClientId) throw new HttpError(503, 'Google sign-in is not set up on this server.');
    const fail = () => new HttpError(401, "Couldn't verify your Google sign-in. Try again.");
    let info: { aud?: string; azp?: string; sub?: string; email?: string; email_verified?: string | boolean; expires_in?: string | number };
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw fail();
      info = await r.json();
    } catch {
      throw fail();
    }
    if (info.aud !== env.googleClientId && info.azp !== env.googleClientId)
      throw new HttpError(401, 'This Google sign-in was made for a different app.');
    if (Number(info.expires_in ?? 0) <= 0) throw fail();
    if (!info.sub || !info.email) throw new HttpError(401, "Google didn't share an email address for this account.");
    if (info.email_verified !== true && info.email_verified !== 'true')
      throw new HttpError(401, 'Verify your email address with Google first, then try again.');
    let profile: { name?: string; picture?: string } = {};
    try {
      const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (u.ok) profile = await u.json();
    } catch {
      /* keep the email-based name */
    }
    const email = info.email.toLowerCase();
    return { sub: info.sub, email, name: profile.name?.trim() || email.split('@')[0], picture: profile.picture };
  },
};

/* ------------------------------------------------------------------ routes */

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const password = z.string().min(8, 'Use at least 8 characters.').max(200);
const nextColor = async () => AVATAR_COLORS[(await prisma.user.count()) % AVATAR_COLORS.length];

export const authRouter = Router();

/** Public settings the login page needs. */
authRouter.get('/config', (_req, res) =>
  res.json({ googleClientId: env.googleClientId || null, emailConfirmation: env.requireEmailConfirmation, emailEnabled: mailEnabled }),
);

authRouter.post(
  '/signup',
  authLimit,
  handle(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2, 'Enter your name.').max(60), email, password }), req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new HttpError(
        409,
        existing.passwordHash
          ? 'An account with that email already exists. Log in instead.'
          : 'That email already has an account that uses Google. Choose “Continue with Google”.',
      );
    }
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 10), color: await nextColor() },
    });
    if (env.requireEmailConfirmation) await sendVerification(req, user);
    await startSession(req, res, user.id);
    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  authLimit,
  handle(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1) }), req.body);
    checkLock(body.email);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (user && !user.passwordHash) throw new HttpError(401, 'This account signs in with Google. Choose “Continue with Google”.');
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash!))) {
      recordFailure(body.email);
      throw new HttpError(401, "That email and password don't match. Check them and try again.");
    }
    if (user.suspendedAt) throw new HttpError(403, SUSPENDED);
    failedLogins.delete(body.email);
    await startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  }),
);

/** "Continue with Google". An unconfirmed account found by email is reclaimed: its password and sessions are removed. */
authRouter.post(
  '/google',
  authLimit,
  handle(async (req, res) => {
    const body = parse(
      z
        .object({ credential: z.string().min(20).optional(), accessToken: z.string().min(20).optional() })
        .refine((b) => b.credential || b.accessToken, { message: 'Missing Google credential.' }),
      req.body,
    );
    const g = body.accessToken ? await google.verifyAccessToken(body.accessToken) : await google.verify(body.credential!);
    if (isSiteAdminAccount(g.email)) throw new HttpError(403, 'This admin account signs in with its email and password only.');

    let user =
      (await prisma.user.findUnique({ where: { googleId: g.sub } })) ?? (await prisma.user.findUnique({ where: { email: g.email } }));
    let created = false;
    if (user?.suspendedAt) throw new HttpError(403, SUSPENDED);
    if (user) {
      const takeOver = !user.emailVerifiedAt && user.googleId !== g.sub;
      if (takeOver) await endAllSessions(user.id);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: g.sub,
          avatarUrl: user.avatarUrl ?? g.picture ?? null,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          ...(takeOver ? { passwordHash: null } : {}),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: g.name.slice(0, 60),
          email: g.email,
          googleId: g.sub,
          avatarUrl: g.picture ?? null,
          color: await nextColor(),
          emailVerifiedAt: new Date(),
        },
      });
      created = true;
    }
    await startSession(req, res, user.id);
    res.status(created ? 201 : 200).json({ user: publicUser(user), created });
  }),
);

/** Opened from the email link. Works without being logged in (the link may open in another browser). */
authRouter.post(
  '/verify',
  authLimit,
  handle(async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(20, 'This confirmation link is incomplete.') }), req.body);
    const v = await prisma.emailVerification.findUnique({ where: { tokenHash: sha256(token) } });
    if (!v || v.expiresAt.getTime() < Date.now())
      throw new HttpError(410, 'This confirmation link has expired or was already used. Send a new one from the banner after you log in.');
    const user = await prisma.user.update({ where: { id: v.userId }, data: { emailVerifiedAt: new Date() } });
    await prisma.emailVerification.deleteMany({ where: { userId: v.userId } });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/verify/resend',
  emailLimit,
  requireUser,
  handle(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new HttpError(401, 'Your session ended. Log in again.');
    if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const recent = await prisma.emailVerification.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent) throw new HttpError(429, 'We just sent one. Wait a minute before asking again.');
    if (!(await sendVerification(req, user))) throw new HttpError(502, "We couldn't send the email right now. Try again in a few minutes.");
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ forgot password */

const RESET_TTL = 60 * 60 * 1000; // 1 hour

/** Same answer whether or not the email has an account, so nobody can use it to find out who signed up. */
authRouter.post(
  '/forgot',
  emailLimit,
  handle(async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // The built-in admin's password lives on the host (SITE_ADMIN_PASSWORD), so no reset email goes out for it.
    if (user && !isSiteAdminAccount(user.email)) {
      const recent = await prisma.passwordReset.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
      if (!recent) {
        await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
        const token = newToken();
        await prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL) },
        });
        try {
          await mailer.send({ to: user.email, ...resetEmail(user.name, `${appOrigin(req)}/reset-password?token=${token}`) });
        } catch (e) {
          console.error('Could not send reset email:', e);
          throw new HttpError(502, "We couldn't send the email right now. Try again in a few minutes.");
        }
      }
    }
    res.json({ ok: true });
  }),
);

/** Sets the new password, confirms the email (they opened our email), ends every old session, logs this browser in. */
authRouter.post(
  '/reset',
  authLimit,
  handle(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(20, 'This reset link is incomplete.'), password }), req.body);
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new HttpError(410, 'This reset link has expired or was already used. Ask for a new one.');
    }
    const existing = await prisma.user.findUniqueOrThrow({ where: { id: reset.userId } });
    if (existing.suspendedAt) throw new HttpError(403, SUSPENDED);
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await bcrypt.hash(body.password, 10), emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
      }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.passwordReset.deleteMany({ where: { userId: reset.userId, NOT: { id: reset.id } } }),
    ]);
    failedLogins.delete(user.email);
    await endAllSessions(user.id);
    await startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  }),
);

/* ------------------------------------------------------------------ logout */

authRouter.post(
  '/logout',
  handle(async (req, res) => {
    const s = await sessionFromToken(req.cookies?.[COOKIE]);
    if (s) {
      await prisma.session.deleteMany({ where: { id: s.sessionId } });
      void disconnectSession(s.userId, s.sessionId);
    }
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }),
);

/** "Log out everywhere": ends the sessions on every browser and phone. */
authRouter.post(
  '/logout-all',
  requireUser,
  handle(async (req, res) => {
    await endAllSessions(req.userId);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireUser,
  handle(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new HttpError(401, 'Your session ended. Log in again.');
    res.json({ user: { ...publicUser(user), isAdmin: isAdmin(user), adminPending: isPendingAdmin(user) } });
  }),
);

/* ------------------------------------------------------------------ profile & settings */

/** What the settings page needs about your own account. */
authRouter.get(
  '/account',
  requireUser,
  handle(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new HttpError(401, 'Your session ended. Log in again.');
    const sessions = await prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } });
    res.json({
      user: publicUser(user),
      hasPassword: !!user.passwordHash,
      usesGoogle: !!user.googleId,
      builtInAdmin: isSiteAdminAccount(user.email),
      createdAt: user.createdAt.toISOString(),
      sessions,
    });
  }),
);

authRouter.patch(
  '/account',
  requireUser,
  handle(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2, 'Use at least 2 characters.').max(60) }), req.body);
    const user = await prisma.user.update({ where: { id: req.userId }, data: { name } });
    res.json({ user: publicUser(user) });
  }),
);

/** Change your password (or set one, if you only used Google so far). */
authRouter.post(
  '/password',
  authLimit,
  requireUser,
  handle(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().max(200).optional(), newPassword: password }), req.body);
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new HttpError(401, 'Your session ended. Log in again.');
    if (isSiteAdminAccount(user.email))
      throw new HttpError(403, "This admin's password is set on the server (SITE_ADMIN_PASSWORD). Change it there.");
    if (user.passwordHash) {
      if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
        throw new HttpError(400, 'Your current password is not right.');
      }
      if (await bcrypt.compare(body.newPassword, user.passwordHash))
        throw new HttpError(400, 'Choose a password different from the current one.');
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    // Log out everywhere else; keep this browser.
    const others = await prisma.session.findMany({ where: { userId: user.id, NOT: { id: req.sessionId } }, select: { id: true } });
    await prisma.session.deleteMany({ where: { id: { in: others.map((s) => s.id) } } });
    for (const s of others) void disconnectSession(user.id, s.id);
    failedLogins.delete(user.email);
    res.json({ ok: true, loggedOutElsewhere: others.length });
  }),
);
