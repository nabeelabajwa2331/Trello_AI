import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

export const publicUser = (u: { id: string; name: string; email: string; color: string }) => ({ id: u.id, name: u.name, email: u.email, color: u.color });

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

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const password = z.string().min(8, 'Use at least 8 characters.').max(200);

export const authRouter = Router();

authRouter.post(
  '/signup',
  handle(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2, 'Enter your name.').max(60), email, password }), req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw new HttpError(409, 'An account with that email already exists. Log in instead.');
    const count = await prisma.user.count();
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 10), color: AVATAR_COLORS[count % AVATAR_COLORS.length] },
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
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw new HttpError(401, "That email and password don't match. Check them and try again.");
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
