import { prisma } from './db.js';

/**
 * Serialises a board into the exact shape the frontend store uses (frontend/src/types.ts),
 * plus the users who appear on it. Sent over REST and over the socket.
 */
export async function boardSnapshot(boardId: string) {
  const b = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
      lists: { orderBy: { position: 'asc' } },
      cards: {
        orderBy: { position: 'asc' },
        include: { assignees: true, comments: { orderBy: { createdAt: 'asc' } } },
      },
      invites: { orderBy: { createdAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 150, include: { user: true } },
    },
  });
  if (!b) return null;

  const lists: Record<string, { id: string; title: string; cardIds: string[]; isDone: boolean }> = {};
  for (const l of b.lists) lists[l.id] = { id: l.id, title: l.title, cardIds: [], isDone: l.isDone };

  const cards: Record<string, unknown> = {};
  for (const c of b.cards) {
    if (!c.archived && lists[c.listId]) lists[c.listId].cardIds.push(c.id);
    cards[c.id] = {
      id: c.id,
      title: c.title,
      description: c.description,
      labels: safeJson(c.labels),
      assignees: c.assignees.map((a) => a.userId),
      due: c.due,
      comments: c.comments.map((m) => ({ id: m.id, userId: m.userId, text: m.text, edited: m.edited, createdAt: m.createdAt.toISOString() })),
      createdAt: c.createdAt.toISOString(),
      archived: c.archived,
      archivedFrom: c.archived ? c.listId : undefined,
    };
  }

  const now = Date.now();
  const link = b.invites.find((i) => i.token && (!i.expiresAt || i.expiresAt.getTime() > now));

  const users: Record<string, { id: string; name: string; email: string; color: string }> = {};
  for (const m of b.members) users[m.userId] = { id: m.user.id, name: m.user.name, email: m.user.email, color: m.user.color };
  for (const a of b.activities) users[a.userId] ??= { id: a.user.id, name: a.user.name, email: a.user.email, color: a.user.color };

  return {
    board: {
      id: b.id,
      title: b.title,
      cover: b.cover,
      starred: false, // per-viewer; filled in by the REST layer
      listOrder: b.lists.map((l) => l.id),
      lists,
      cards,
      members: b.members.map((m) => ({ userId: m.userId, role: m.role })),
      invites: b.invites.filter((i) => i.email).map((i) => ({ id: i.id, email: i.email!, role: i.role, createdAt: i.createdAt.toISOString() })),
      inviteLink: link ? { role: link.role, token: link.token!, expiresAt: link.expiresAt ? link.expiresAt.toISOString().slice(0, 10) : '' } : null,
      activity: b.activities.map((a) => ({ id: a.id, userId: a.userId, text: a.text, cardId: a.cardId ?? undefined, createdAt: a.createdAt.toISOString() })),
      updatedAt: b.updatedAt.toISOString(),
    },
    users,
  };
}

export type Snapshot = NonNullable<Awaited<ReturnType<typeof boardSnapshot>>>;

function safeJson(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
