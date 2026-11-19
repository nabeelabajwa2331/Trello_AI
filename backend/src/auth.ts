import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './env.js';
import { HttpError, handle, parse } from './http.js';

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
    const { credential } = parse(z.object({ credential: z.string().min(20, 'Missing Google credential.') }), req.body);
    const g = await google.verify(credential);

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
