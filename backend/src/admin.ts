/**
 * Site admin panel API (/api/admin). Only for confirmed accounts listed in ADMIN_EMAILS.
 * Shows counts and account details. It never returns the contents of anyone's cards or comments.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './env.js';
import { HttpError, appOrigin, forbidden, handle, notFound, parse } from './http.js';
import { endAllSessions, isAdmin, requireUser, sendVerification } from './auth.js';
import { checkMail, mailEnabled, mailProvider, mailer, testEmail } from './mail.js';
import { boardDeleted, broadcastBoard } from './realtime.js';

export const admin = Router();

admin.use(requireUser, (req: Request, _res: Response, next: NextFunction) => {
  prisma.user
    .findUnique({ where: { id: req.userId } })
    .then((u) => (u && isAdmin(u) ? next() : next(notFound('This page'))))
    .catch(next);
});

const DAY = 864e5;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ------------------------------------------------------------------ overview */

admin.get(
  '/overview',
  handle(async (_req, res) => {
    const now = new Date();
    const since14 = new Date(startOfDay(now).getTime() - 13 * DAY);
    const [users, verified, google, suspended, newWeek, boards, cards, comments, activeToday, recent] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.user.count({ where: { googleId: { not: null } } }),
      prisma.user.count({ where: { suspendedAt: { not: null } } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      prisma.board.count(),
      prisma.card.count({ where: { archived: false } }),
      prisma.comment.count(),
      prisma.activity.groupBy({ by: ['userId'], where: { createdAt: { gte: new Date(now.getTime() - DAY) } } }),
      prisma.user.findMany({ where: { createdAt: { gte: since14 } }, select: { createdAt: true } }),
    ]);

    const perDay = new Map<string, number>();
    for (let i = 0; i < 14; i++) perDay.set(ymd(new Date(since14.getTime() + i * DAY)), 0);
    for (const u of recent) {
      const k = ymd(u.createdAt);
      if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1);
    }

    res.json({
      users,
      verified,
      google,
      suspended,
      newThisWeek: newWeek,
      activeToday: activeToday.length,
      boards,
      cards,
      comments,
      signups: [...perDay].map(([date, count]) => ({ date, count })),
      system: {
        email: mailEnabled,
        emailProvider: mailProvider,
        emailConfirmation: env.requireEmailConfirmation,
        google: !!env.googleClientId,
        appUrl: env.appUrl || null,
        admins: [...env.adminEmails, ...(env.siteAdmin.email ? [`${env.siteAdmin.email} (built-in)`] : [])],
      },
    });
  }),
);

/* ------------------------------------------------------------------ email check */

/** Connects to the email service without sending anything. */
admin.get(
  '/email-check',
  handle(async (_req, res) => {
    res.json(await checkMail());
  }),
);

/** Sends a real test email so you can see it arrive (and check the spam folder). */
admin.post(
  '/test-email',
  handle(async (req, res) => {
    const { to } = parse(z.object({ to: z.string().trim().toLowerCase().email('Enter a valid email address.') }), req.body);
    if (!mailEnabled) throw new HttpError(400, 'No email service is set up yet. Add the SMTP or BREVO settings on Render first.');
    try {
      await mailer.send({ to, ...testEmail(appOrigin(req)) });
    } catch (e) {
      throw new HttpError(502, `Sending failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ users */

admin.get(
  '/users',
  handle(async (req, res) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(100).optional(),
        filter: z.enum(['all', 'unverified', 'suspended', 'google']).default('all'),
        page: z.coerce.number().int().min(1).max(10_000).default(1),
      }),
      req.query,
    );
    const PAGE = 25;
    const where = {
      ...(q.q ? { OR: [{ name: { contains: q.q } }, { email: { contains: q.q.toLowerCase() } }] } : {}),
      ...(q.filter === 'unverified' ? { emailVerifiedAt: null } : {}),
      ...(q.filter === 'suspended' ? { suspendedAt: { not: null } } : {}),
      ...(q.filter === 'google' ? { googleId: { not: null } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE,
        take: PAGE,
        include: {
          memberships: { select: { role: true } },
          sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          activities: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ]);
    res.json({
      emailConfirmation: env.requireEmailConfirmation,
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
      users: rows.map((u) => {
        const seen = [u.sessions[0]?.createdAt, u.activities[0]?.createdAt].filter(Boolean) as Date[];
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          color: u.color,
          avatarUrl: u.avatarUrl,
          createdAt: u.createdAt.toISOString(),
          emailVerified: !!u.emailVerifiedAt,
          signIn: [u.passwordHash ? 'email' : null, u.googleId ? 'google' : null].filter(Boolean),
          suspended: !!u.suspendedAt,
          isAdmin: isAdmin(u),
          boards: u.memberships.length,
          owns: u.memberships.filter((m) => m.role === 'owner').length,
          lastActive: seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))).toISOString() : null,
        };
      }),
    });
  }),
);

async function targetUser(req: Request) {
  const u = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!u) throw notFound('That user');
  if (u.id === req.userId) throw forbidden("You can't do that to your own account here.");
  if (isAdmin(u)) throw forbidden('Other site admins can only be changed by removing them from ADMIN_EMAILS.');
  return u;
}

admin.post(
  '/users/:userId/suspend',
  handle(async (req, res) => {
    const { suspended } = parse(z.object({ suspended: z.boolean() }), req.body);
    const u = await targetUser(req);
    await prisma.user.update({ where: { id: u.id }, data: { suspendedAt: suspended ? new Date() : null } });
    if (suspended) await endAllSessions(u.id);
    console.log(`[admin] ${req.userId} ${suspended ? 'suspended' : 'unsuspended'} ${u.email}`);
    res.json({ ok: true, suspended });
  }),
);

admin.post(
  '/users/:userId/resend-verification',
  handle(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!u) throw notFound('That user');
    if (u.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    if (!(await sendVerification(req, u))) throw new HttpError(502, "The email couldn't be sent. Check the SMTP settings.");
    res.json({ ok: true });
  }),
);

/**
 * Deletes an account. Boards they own go to the next person (an admin first, then the longest-standing member);
 * boards with nobody else on them are deleted.
 */
admin.delete(
  '/users/:userId',
  handle(async (req, res) => {
    const u = await targetUser(req);
    const owned = await prisma.boardMember.findMany({ where: { userId: u.id, role: 'owner' }, select: { boardId: true } });
    let transferred = 0;
    let deleted = 0;
    const touched: string[] = [];
    for (const { boardId } of owned) {
      const heir =
        (await prisma.boardMember.findFirst({ where: { boardId, role: 'admin', NOT: { userId: u.id } }, orderBy: { joinedAt: 'asc' } })) ??
        (await prisma.boardMember.findFirst({ where: { boardId, role: { in: ['member', 'viewer'] }, NOT: { userId: u.id } }, orderBy: { joinedAt: 'asc' } }));
      if (heir) {
        await prisma.boardMember.update({ where: { boardId_userId: { boardId, userId: heir.userId } }, data: { role: 'owner' } });
        await prisma.activity.create({ data: { boardId, userId: heir.userId, text: 'became the owner (the previous owner’s account was deleted)' } });
        touched.push(boardId);
        transferred++;
      } else {
        boardDeleted(boardId);
        await prisma.board.delete({ where: { id: boardId } });
        deleted++;
      }
    }
    const shared = await prisma.boardMember.findMany({ where: { userId: u.id }, select: { boardId: true } });
    await endAllSessions(u.id);
    await prisma.user.delete({ where: { id: u.id } }); // memberships, comments, assignments go with it
    for (const b of new Set([...touched, ...shared.map((s) => s.boardId)])) await broadcastBoard(b, null);
    console.log(`[admin] ${req.userId} deleted ${u.email} (boards transferred: ${transferred}, deleted: ${deleted})`);
    res.json({ ok: true, transferred, deleted });
  }),
);

/* ------------------------------------------------------------------ boards (metadata only) */

admin.get(
  '/boards',
  handle(async (req, res) => {
    const q = parse(z.object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1) }), req.query);
    const PAGE = 25;
    const where = q.q ? { title: { contains: q.q } } : {};
    const [total, rows] = await Promise.all([
      prisma.board.count({ where }),
      prisma.board.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * PAGE,
        take: PAGE,
        include: {
          members: { where: { role: 'owner' }, include: { user: { select: { name: true, email: true } } } },
          _count: { select: { members: true, cards: true, lists: true } },
        },
      }),
    ]);
    res.json({
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
      boards: rows.map((b) => ({
        id: b.id,
        title: b.title,
        cover: b.cover,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        owner: b.members[0] ? { name: b.members[0].user.name, email: b.members[0].user.email } : null,
        members: b._count.members,
        lists: b._count.lists,
        cards: b._count.cards,
      })),
    });
  }),
);
