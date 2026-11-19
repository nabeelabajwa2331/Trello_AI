import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './env.js';
import { HttpError, handle, parse } from './http.js';
import { mailer, resetEmail } from './mail.js';
import crypto from 'node:crypto';

export const COOKIE = 'cb_token';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const AVATAR_COLORS = ['#A8574A', '#5E7D57', '#4F6C86', '#7D6688', '#A8642F', '#4C7A75', '#8A8378'];

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

type UserRow = { id: string; name: string; email: string; color: string; avatarUrl?: string | null };
export const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, color: u.color, avatarUrl: u.avatarUrl ?? null });

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as { sub: string };
    return p.sub;
  } catch {
    return null;
  }
}

function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProd, maxAge: WEEK, path: '/' });
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const id = verifyToken(req.cookies?.[COOKIE]);
  if (!id) return next(new HttpError(401, 'Log in to continue.'));
  req.userId = id;
  next();
}

const nextColor = async () => AVATAR_COLORS[(await prisma.user.count()) % AVATAR_COLORS.length];

/* ------------------------------------------------------------------ Google */

export type GoogleProfile = { sub: string; email: string; name: string; picture?: string };

const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

/**
 * Checks the ID token Google gave the browser: signed by Google, meant for our Client ID, not expired,
 * and the email is verified. Exposed as an object so tests can replace it.
 */
export const google = {
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

  /**
   * Checks an OAuth access token from our own styled button (Google's token popup).
   * Google's tokeninfo endpoint tells us which app the token was issued to; we only accept our Client ID.
   */
  async verifyAccessToken(accessToken: string): Promise<GoogleProfile> {
    if (!env.googleClientId) throw new HttpError(503, 'Google sign-in is not set up on this server.');
    const fail = () => new HttpError(401, "Couldn't verify your Google sign-in. Try again.");
    let info: { aud?: string; azp?: string; sub?: string; email?: string; email_verified?: string | boolean; expires_in?: string | number };
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw fail();
      info = await r.json();
    } catch {
      throw fail();
    }
    if (info.aud !== env.googleClientId && info.azp !== env.googleClientId) throw new HttpError(401, 'This Google sign-in was made for a different app.');
    if (Number(info.expires_in ?? 0) <= 0) throw fail();
    if (!info.sub || !info.email) throw new HttpError(401, "Google didn't share an email address for this account.");
    if (info.email_verified !== true && info.email_verified !== 'true') throw new HttpError(401, 'Verify your email address with Google first, then try again.');

    // Name and photo come from the userinfo endpoint; sign-in still works if it's unavailable.
    let profile: { name?: string; picture?: string } = {};
    try {
      const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) });
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

export const authRouter = Router();

/** Public settings the login page needs. */
authRouter.get('/config', (_req, res) => res.json({ googleClientId: env.googleClientId || null }));

authRouter.post(
  '/signup',
  handle(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2, 'Enter your name.').max(60), email, password }), req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new HttpError(409, existing.passwordHash ? 'An account with that email already exists. Log in instead.' : 'That email already has an account that uses Google. Choose “Continue with Google”.');
    }
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 10), color: await nextColor() },
    });
    setSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  handle(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1) }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (user && !user.passwordHash) throw new HttpError(401, 'This account signs in with Google. Choose “Continue with Google”.');
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash!))) throw new HttpError(401, "That email and password don't match. Check them and try again.");
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  }),
);

/**
 * "Continue with Google". Finds the user by Google id, then by email (so someone who signed up with
 * email and password lands in the same account), and creates an account if neither exists.
 */
authRouter.post(
  '/google',
  handle(async (req, res) => {
    // accessToken: our styled button (OAuth popup). credential: an ID token from Google's own button.
    const body = parse(
      z
        .object({ credential: z.string().min(20).optional(), accessToken: z.string().min(20).optional() })
        .refine((b) => b.credential || b.accessToken, { message: 'Missing Google credential.' }),
      req.body,
    );
    const g = body.accessToken ? await google.verifyAccessToken(body.accessToken) : await google.verify(body.credential!);

    let user = (await prisma.user.findUnique({ where: { googleId: g.sub } })) ?? (await prisma.user.findUnique({ where: { email: g.email } }));
    let created = false;
    if (user) {
      if (user.googleId !== g.sub || (!user.avatarUrl && g.picture)) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId: g.sub, avatarUrl: user.avatarUrl ?? g.picture ?? null } });
      }
    } else {
      user = await prisma.user.create({ data: { name: g.name.slice(0, 60), email: g.email, googleId: g.sub, avatarUrl: g.picture ?? null, color: await nextColor() } });
      created = true;
    }
    setSession(res, user.id);
    res.status(created ? 201 : 200).json({ user: publicUser(user), created });
  }),
);

/* ------------------------------------------------------------------ forgot password */

const RESET_TTL = 60 * 60 * 1000; // 1 hour
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Always answers the same way, whether or not the email has an account, so nobody can use this
 * form to find out who is signed up.
 */
authRouter.post(
  '/forgot',
  handle(async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (user) {
      const recent = await prisma.passwordReset.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
      if (!recent) {
        // One active link at a time.
        await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
        const token = crypto.randomBytes(32).toString('base64url');
        await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL) } });
        const origin = env.appUrl || req.get('origin') || `${req.protocol}://${req.get('host')}`;
        const link = `${origin}/reset-password?token=${token}`;
        try {
          await mailer.send({ to: user.email, ...resetEmail(user.name, link) });
        } catch (e) {
          console.error('Could not send reset email:', e);
          throw new HttpError(502, "We couldn't send the email right now. Try again in a few minutes.");
        }
      }
    }
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/reset',
  handle(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(20, 'This reset link is incomplete.'), password }), req.body);
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new HttpError(410, 'This reset link has expired or was already used. Ask for a new one.');
    }
    const [user] = await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(body.password, 10) } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.passwordReset.deleteMany({ where: { userId: reset.userId, NOT: { id: reset.id } } }),
    ]);
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireUser,
  handle(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new HttpError(401, 'Log in to continue.');
    res.json({ user: publicUser(user) });
  }),
);
