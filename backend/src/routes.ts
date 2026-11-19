import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db.js';
import { HttpError, forbidden, handle, notFound, parse } from './http.js';
import { requireUser, publicUser } from './auth.js';
import { requireRole, type Action } from './permissions.js';
import { boardSnapshot } from './snapshot.js';
import { addUserToBoardRoom, boardDeleted, broadcastBoard, notifyUser, removeUserFromBoardRoom, type Log } from './realtime.js';
import { COVERS, TEMPLATES, type TemplateId } from './templates.js';

export const api = Router();
api.use(requireUser);

/* ------------------------------------------------------------------ helpers */

const id = z.string().min(1).max(64);
const roleSchema = z.enum(['admin', 'member', 'viewer']);
const LABELS = ['research', 'design', 'bug', 'docs', 'urgent', 'backend', 'slides', 'misc'] as const;
const quote = (s: string) => `“${s}”`;

/** Board snapshot with this viewer's starred flag. */
async function snapshotFor(boardId: string, userId: string) {
  const [snap, me] = await Promise.all([boardSnapshot(boardId), prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } })]);
  if (!snap || !me) throw notFound('This board');
  snap.board.starred = me.starred;
  return snap;
}

/**
 * Every change goes through here: check the role, apply it, log it, push the new board to everyone, return it.
 */
async function mutate(req: Request, boardId: string, action: Action, apply: () => Promise<string | void | null>, staticLog?: string, cardId?: string) {
  await requireRole(boardId, req.userId, action);
  const dynamicLog = await apply();
  const text = (dynamicLog || staticLog) ?? null;
  if (text) await prisma.activity.create({ data: { boardId, userId: req.userId, text, cardId } });
  await prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
  const log: Log | null = text ? { text, actorId: req.userId, cardId } : null;
  await broadcastBoard(boardId, log);
  return snapshotFor(boardId, req.userId);
}

async function notify(userId: string, actorId: string, boardId: string, text: string, cardId?: string) {
  if (userId === actorId) return;
  const n = await prisma.notification.create({ data: { userId, actorId, boardId, cardId, text } });
  notifyUser(userId, serializeNotification(n));
}

const serializeNotification = (n: { id: string; text: string; actorId: string; boardId: string; cardId: string | null; read: boolean; createdAt: Date }) => ({
  id: n.id, text: n.text, actorId: n.actorId, boardId: n.boardId, cardId: n.cardId ?? undefined, read: n.read, createdAt: n.createdAt.toISOString(),
});

async function cardOr404(cardId: string) {
  const c = await prisma.card.findUnique({ where: { id: cardId }, include: { list: true, assignees: true } });
  if (!c) throw notFound('This card');
  return c;
}

async function listOr404(listId: string) {
  const l = await prisma.list.findUnique({ where: { id: listId } });
  if (!l) throw notFound('This list');
  return l;
}

/** Fractional position for inserting at `index` among the non-archived cards of a list. */
async function positionAt(listId: string, index: number, excludeCardId?: string) {
  const siblings = await prisma.card.findMany({
    where: { listId, archived: false, NOT: excludeCardId ? { id: excludeCardId } : undefined },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  });
  const i = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[i - 1]?.position;
  const after = siblings[i]?.position;
  let pos: number;
  if (before === undefined && after === undefined) pos = 1024;
  else if (before === undefined) pos = after! - 1024;
  else if (after === undefined) pos = before + 1024;
  else pos = (before + after) / 2;

  // Gaps get tiny after many moves into the same spot; renumber the list when that happens.
  if (before !== undefined && after !== undefined && after - before < 1e-6) {
    await prisma.$transaction(siblings.map((s, k) => prisma.card.update({ where: { id: s.id }, data: { position: (k + 1) * 1024 } })));
    return positionAt(listId, index, excludeCardId);
  }
  return pos;
}

/** Notify board members whose first name is @mentioned. */
async function notifyMentions(boardId: string, actorId: string, text: string, cardId: string, cardTitle: string) {
  const handles = new Set([...text.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase()));
  if (!handles.size) return;
  const members = await prisma.boardMember.findMany({ where: { boardId }, include: { user: true } });
  for (const m of members) {
    const first = m.user.name.split(/\s+/)[0].toLowerCase();
    if (handles.has(first)) await notify(m.userId, actorId, boardId, `mentioned you on ${quote(cardTitle)}`, cardId);
  }
}

/* ------------------------------------------------------------------ bootstrap */

/** Everything the app needs after login, in one request. */
api.get(
  '/bootstrap',
  handle(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!me) throw new HttpError(401, 'Log in to continue.');
    const memberships = await prisma.boardMember.findMany({ where: { userId: req.userId }, include: { board: true }, orderBy: { board: { updatedAt: 'desc' } } });
    const snaps = await Promise.all(memberships.map((m) => snapshotFor(m.boardId, req.userId)));
    const incoming = await prisma.invite.findMany({ where: { email: me.email }, include: { board: true, invitedBy: true }, orderBy: { createdAt: 'desc' } });
    const notifications = await prisma.notification.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 50 });

    const users: Record<string, ReturnType<typeof publicUser>> = { [me.id]: publicUser(me) };
    for (const s of snaps) Object.assign(users, s.users);
    for (const i of incoming) users[i.invitedById] = publicUser(i.invitedBy);
    for (const n of notifications) if (!users[n.actorId]) {
      const a = await prisma.user.findUnique({ where: { id: n.actorId } });
      if (a) users[a.id] = publicUser(a);
    }

    res.json({
      me: publicUser(me),
      users,
      boards: snaps.map((s) => s.board),
      incoming: incoming.map((i) => ({ id: i.id, fromUserId: i.invitedById, role: i.role, boardTitle: i.board.title, boardCover: i.board.cover })),
      notifications: notifications.map(serializeNotification),
    });
  }),
);

/* ------------------------------------------------------------------ boards */

api.post(
  '/boards',
  handle(async (req, res) => {
    const body = parse(z.object({ title: z.string().trim().min(1, 'Give the board a name.').max(60), template: z.enum(['blank', 'class', 'hackathon']).default('blank') }), req.body);
    const count = await prisma.boardMember.count({ where: { userId: req.userId } });
    const board = await prisma.board.create({
      data: {
        title: body.title,
        cover: COVERS[count % COVERS.length],
        members: { create: { userId: req.userId, role: 'owner' } },
        activities: { create: { userId: req.userId, text: 'created this board' } },
      },
    });
    const lists = TEMPLATES[body.template as TemplateId];
    for (const [i, l] of lists.entries()) {
      await prisma.list.create({
        data: {
          boardId: board.id, title: l.title, position: (i + 1) * 1024, isDone: !!l.isDone,
          cards: { create: l.cards.map((t, k) => ({ boardId: board.id, title: t, position: (k + 1) * 1024 })) },
        },
      });
    }
    await addUserToBoardRoom(req.userId, board.id);
    res.status(201).json(await snapshotFor(board.id, req.userId));
  }),
);

api.get(
  '/boards/:boardId',
  handle(async (req, res) => {
    await requireRole(req.params.boardId, req.userId, 'view');
    res.json(await snapshotFor(req.params.boardId, req.userId));
  }),
);

api.patch(
  '/boards/:boardId',
  handle(async (req, res) => {
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(60) }), req.body);
    const { boardId } = req.params;
    res.json(await mutate(req, boardId, 'editBoard', async () => void (await prisma.board.update({ where: { id: boardId }, data: { title } })), `renamed the board to ${quote(title)}`));
  }),
);

api.post(
  '/boards/:boardId/star',
  handle(async (req, res) => {
    const { starred } = parse(z.object({ starred: z.boolean() }), req.body);
    await requireRole(req.params.boardId, req.userId, 'view');
    await prisma.boardMember.update({ where: { boardId_userId: { boardId: req.params.boardId, userId: req.userId } }, data: { starred } });
    res.json({ starred });
  }),
);

api.delete(
  '/boards/:boardId',
  handle(async (req, res) => {
    await requireRole(req.params.boardId, req.userId, 'deleteBoard');
    boardDeleted(req.params.boardId);
    await prisma.board.delete({ where: { id: req.params.boardId } });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ lists */

api.post(
  '/boards/:boardId/lists',
  handle(async (req, res) => {
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(60) }), req.body);
    const { boardId } = req.params;
    res.json(
      await mutate(req, boardId, 'editLists', async () => {
        const last = await prisma.list.findFirst({ where: { boardId }, orderBy: { position: 'desc' } });
        await prisma.list.create({ data: { boardId, title, position: (last?.position ?? 0) + 1024 } });
      }, `added the list ${quote(title)}`),
    );
  }),
);

api.put(
  '/boards/:boardId/list-order',
  handle(async (req, res) => {
    const { order } = parse(z.object({ order: z.array(id).max(100) }), req.body);
    const { boardId } = req.params;
    res.json(
      await mutate(req, boardId, 'editLists', async () => {
        const lists = await prisma.list.findMany({ where: { boardId }, select: { id: true } });
        const ids = new Set(lists.map((l) => l.id));
        if (order.length !== ids.size || !order.every((o) => ids.has(o))) throw new HttpError(409, 'The lists changed while you were dragging. Try again.');
        await prisma.$transaction(order.map((lid, i) => prisma.list.update({ where: { id: lid }, data: { position: (i + 1) * 1024 } })));
      }, 'reordered the lists'),
    );
  }),
);

api.patch(
  '/lists/:listId',
  handle(async (req, res) => {
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(60) }), req.body);
    const list = await listOr404(req.params.listId);
    res.json(await mutate(req, list.boardId, 'editLists', async () => void (await prisma.list.update({ where: { id: list.id }, data: { title } })), `renamed the list ${quote(list.title)} to ${quote(title)}`));
  }),
);

api.delete(
  '/lists/:listId',
  handle(async (req, res) => {
    const list = await listOr404(req.params.listId);
    res.json(
      await mutate(req, list.boardId, 'editLists', async () => {
        const n = await prisma.card.count({ where: { listId: list.id, archived: false } });
        if (n) throw new HttpError(409, 'Move or archive the cards in this list first, then delete it.');
        await prisma.list.delete({ where: { id: list.id } });
      }, `deleted the list ${quote(list.title)}`),
    );
  }),
);

/* ------------------------------------------------------------------ cards */

api.post(
  '/lists/:listId/cards',
  handle(async (req, res) => {
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(200) }), req.body);
    const list = await listOr404(req.params.listId);
    let cardId: string | undefined;
    const snap = await mutate(req, list.boardId, 'editCards', async () => {
      const position = await positionAt(list.id, Number.MAX_SAFE_INTEGER);
      cardId = (await prisma.card.create({ data: { boardId: list.boardId, listId: list.id, title, position } })).id;
      return `added ${quote(title)} to ${list.title}`;
    });
    res.status(201).json({ ...snap, cardId });
  }),
);

api.patch(
  '/cards/:cardId',
  handle(async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        labels: z.array(z.enum(LABELS)).max(8).optional(),
        assignees: z.array(id).max(20).optional(),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a yyyy-mm-dd date.').nullable().optional(),
      }),
      req.body,
    );
    const card = await cardOr404(req.params.cardId);
    const snap = await mutate(
      req,
      card.boardId,
      'editCards',
      async () => {
        const logs: string[] = [];
        const name = body.title ?? card.title;
        if (body.title !== undefined && body.title !== card.title) logs.push(`renamed a card to ${quote(body.title)}`);
        if (body.due !== undefined && body.due !== card.due) logs.push(body.due ? `set ${quote(name)} due ${body.due}` : `removed the due date from ${quote(name)}`);

        await prisma.card.update({
          where: { id: card.id },
          data: { title: body.title, description: body.description, due: body.due, labels: body.labels ? JSON.stringify([...new Set(body.labels)]) : undefined },
        });

        if (body.assignees) {
          const members = new Set((await prisma.boardMember.findMany({ where: { boardId: card.boardId, NOT: { role: 'viewer' } } })).map((m) => m.userId));
          const next = [...new Set(body.assignees)].filter((u) => members.has(u));
          const prev = card.assignees.map((a) => a.userId);
          const added = next.filter((u) => !prev.includes(u));
          const removed = prev.filter((u) => !next.includes(u));
          await prisma.cardAssignee.deleteMany({ where: { cardId: card.id, userId: { in: removed } } });
          if (added.length) await prisma.cardAssignee.createMany({ data: added.map((userId) => ({ cardId: card.id, userId })) });
          const names = await prisma.user.findMany({ where: { id: { in: [...added, ...removed] } } });
          const nameOf = (u: string) => names.find((n) => n.id === u)?.name ?? 'someone';
          for (const u of added) {
            logs.push(`assigned ${nameOf(u)} to ${quote(name)}`);
            await notify(u, req.userId, card.boardId, `assigned you to ${quote(name)}`, card.id);
          }
          for (const u of removed) logs.push(`removed ${nameOf(u)} from ${quote(name)}`);
        }
        return logs.join(', ') || null;
      },
      undefined,
      card.id,
    );
    res.json(snap);
  }),
);

/** Move a card to `index` in `toListId` (index counts non-archived cards, excluding the moving card). */
api.post(
  '/cards/:cardId/move',
  handle(async (req, res) => {
    const body = parse(z.object({ toListId: id, index: z.number().int().min(0) }), req.body);
    const card = await cardOr404(req.params.cardId);
    const to = await listOr404(body.toListId);
    if (to.boardId !== card.boardId) throw new HttpError(400, 'Cards can only move within the same board.');
    res.json(
      await mutate(req, card.boardId, 'editCards', async () => {
        const position = await positionAt(to.id, body.index, card.id);
        await prisma.card.update({ where: { id: card.id }, data: { listId: to.id, position } });
        return to.id === card.listId ? null : `moved ${quote(card.title)} from ${card.list.title} to ${to.title}`;
      }, undefined, card.id),
    );
  }),
);

api.post(
  '/cards/:cardId/archive',
  handle(async (req, res) => {
    const card = await cardOr404(req.params.cardId);
    res.json(await mutate(req, card.boardId, 'editCards', async () => void (await prisma.card.update({ where: { id: card.id }, data: { archived: true } })), `archived ${quote(card.title)}`, card.id));
  }),
);

api.post(
  '/cards/:cardId/restore',
  handle(async (req, res) => {
    const card = await cardOr404(req.params.cardId);
    res.json(
      await mutate(req, card.boardId, 'editCards', async () => {
        const position = await positionAt(card.listId, Number.MAX_SAFE_INTEGER, card.id);
        await prisma.card.update({ where: { id: card.id }, data: { archived: false, position } });
      }, `restored ${quote(card.title)}`, card.id),
    );
  }),
);

/* ------------------------------------------------------------------ comments */

api.post(
  '/cards/:cardId/comments',
  handle(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body);
    const card = await cardOr404(req.params.cardId);
    res.json(
      await mutate(req, card.boardId, 'comment', async () => {
        await prisma.comment.create({ data: { cardId: card.id, userId: req.userId, text } });
        await notifyMentions(card.boardId, req.userId, text, card.id, card.title);
      }, `commented on ${quote(card.title)}`, card.id),
    );
  }),
);

async function ownComment(commentId: string, userId: string) {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, include: { card: true } });
  if (!c) throw notFound('This comment');
  if (c.userId !== userId) throw forbidden('You can only change your own comments.');
  return c;
}

api.patch(
  '/comments/:commentId',
  handle(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body);
    const c = await ownComment(req.params.commentId, req.userId);
    res.json(await mutate(req, c.card.boardId, 'comment', async () => void (await prisma.comment.update({ where: { id: c.id }, data: { text, edited: true } }))));
  }),
);

api.delete(
  '/comments/:commentId',
  handle(async (req, res) => {
    const c = await ownComment(req.params.commentId, req.userId);
    res.json(await mutate(req, c.card.boardId, 'comment', async () => void (await prisma.comment.delete({ where: { id: c.id } }))));
  }),
);

/* ------------------------------------------------------------------ members & invites */

api.post(
  '/boards/:boardId/invites',
  handle(async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.'), role: roleSchema }), req.body);
    const { boardId } = req.params;
    res.json(
      await mutate(req, boardId, 'invite', async () => {
        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing && (await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId: existing.id } } }))) throw new HttpError(409, 'That person is already on the board.');
        if (await prisma.invite.findFirst({ where: { boardId, email: body.email } })) throw new HttpError(409, 'That person already has an invite.');
        const inv = await prisma.invite.create({ data: { boardId, email: body.email, role: body.role, invitedById: req.userId }, include: { board: true } });
        // If they already have an account, show the invite on their workspace right away.
        if (existing) notifyUser(existing.id, { type: 'invite', invite: { id: inv.id, fromUserId: req.userId, role: inv.role, boardTitle: inv.board.title, boardCover: inv.board.cover } });
      }, `invited ${body.email} as ${body.role}`),
    );
  }),
);

api.delete(
  '/invites/:inviteId',
  handle(async (req, res) => {
    const inv = await prisma.invite.findUnique({ where: { id: req.params.inviteId } });
    if (!inv) throw notFound('This invite');
    res.json(await mutate(req, inv.boardId, 'invite', async () => void (await prisma.invite.delete({ where: { id: inv.id } })), inv.email ? `revoked the invite for ${inv.email}` : 'turned off the invite link'));
  }),
);

api.post(
  '/boards/:boardId/invite-link',
  handle(async (req, res) => {
    const { role } = parse(z.object({ role: roleSchema }), req.body);
    const { boardId } = req.params;
    res.json(
      await mutate(req, boardId, 'invite', async () => {
        await prisma.invite.deleteMany({ where: { boardId, token: { not: null } } });
        await prisma.invite.create({ data: { boardId, role, invitedById: req.userId, token: crypto.randomBytes(18).toString('base64url'), expiresAt: new Date(Date.now() + 7 * 864e5) } });
      }, `created an invite link for ${role}s`),
    );
  }),
);

async function joinBoard(userId: string, boardId: string, role: string) {
  const exists = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
  if (!exists) {
    await prisma.boardMember.create({ data: { boardId, userId, role } });
    await prisma.activity.create({ data: { boardId, userId, text: 'joined the board' } });
    await addUserToBoardRoom(userId, boardId);
    await broadcastBoard(boardId, { text: 'joined the board', actorId: userId });
  }
}

api.post(
  '/join/:token',
  handle(async (req, res) => {
    const inv = await prisma.invite.findUnique({ where: { token: req.params.token } });
    if (!inv || (inv.expiresAt && inv.expiresAt.getTime() < Date.now())) throw new HttpError(410, 'This invite link has expired or was turned off. Ask the board owner for a new one.');
    await joinBoard(req.userId, inv.boardId, inv.role);
    res.json(await snapshotFor(inv.boardId, req.userId));
  }),
);

api.post(
  '/invites/:inviteId/accept',
  handle(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    const inv = await prisma.invite.findUnique({ where: { id: req.params.inviteId } });
    if (!inv || !me || inv.email !== me.email) throw notFound('This invite');
    await joinBoard(req.userId, inv.boardId, inv.role);
    await prisma.invite.delete({ where: { id: inv.id } });
    await broadcastBoard(inv.boardId, null);
    res.json(await snapshotFor(inv.boardId, req.userId));
  }),
);

api.post(
  '/invites/:inviteId/decline',
  handle(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    const inv = await prisma.invite.findUnique({ where: { id: req.params.inviteId } });
    if (!inv || !me || inv.email !== me.email) throw notFound('This invite');
    await prisma.invite.delete({ where: { id: inv.id } });
    await broadcastBoard(inv.boardId, null);
    res.json({ ok: true });
  }),
);

api.patch(
  '/boards/:boardId/members/:userId',
  handle(async (req, res) => {
    const { role } = parse(z.object({ role: roleSchema }), req.body);
    const { boardId, userId } = req.params;
    const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } }, include: { user: true } });
    if (!target) throw notFound('That member');
    if (target.role === 'owner') throw forbidden("The owner's role can't be changed.");
    if (userId === req.userId) throw forbidden("You can't change your own role.");
    res.json(await mutate(req, boardId, 'manageMembers', async () => void (await prisma.boardMember.update({ where: { boardId_userId: { boardId, userId } }, data: { role } })), `changed ${target.user.name}'s role to ${role}`));
  }),
);

api.delete(
  '/boards/:boardId/members/:userId',
  handle(async (req, res) => {
    const { boardId, userId } = req.params;
    const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } }, include: { user: true } });
    if (!target) throw notFound('That member');
    if (target.role === 'owner') throw forbidden("The owner can't be removed.");
    const leaving = userId === req.userId;
    const snap = await mutate(
      req,
      boardId,
      leaving ? 'view' : 'manageMembers',
      async () => {
        await prisma.cardAssignee.deleteMany({ where: { userId, card: { boardId } } });
        await prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } });
        await removeUserFromBoardRoom(userId, boardId);
      },
      leaving ? 'left the board' : `removed ${target.user.name} from the board`,
    ).catch((e) => (leaving && e instanceof HttpError && e.status === 404 ? null : Promise.reject(e)));
    res.json(leaving ? { ok: true } : snap);
  }),
);

/* ------------------------------------------------------------------ notifications */

api.post(
  '/notifications/read-all',
  handle(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.userId, read: false }, data: { read: true } });
    res.json({ ok: true });
  }),
);

api.post(
  '/notifications/:id/read',
  handle(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.userId }, data: { read: true } });
    res.json({ ok: true });
  }),
);
