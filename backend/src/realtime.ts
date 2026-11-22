import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { prisma } from './db.js';
import { env } from './env.js';
import { COOKIE, sessionFromToken } from './auth.js';
import { boardSnapshot, forRole } from './snapshot.js';

/** Rooms: `user:<id>` for one person's sockets (notifications), `board:<id>` for everyone on a board (changes, presence). */
let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.clientOrigins, credentials: true } });

  io.use((socket, next) => {
    // Same address as the website: the login cookie. Website on Vercel: a one-minute ticket from /api/auth/socket-ticket.
    const ticket: unknown = socket.handshake.auth?.ticket;
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    (typeof ticket === 'string' ? sessionFromToken(ticket, 'socket') : sessionFromToken(cookies[COOKIE]))
      .then((s) => {
        if (!s) return next(new Error('unauthorized'));
        socket.data.userId = s.userId;
        socket.data.sessionId = s.sessionId;
        next();
      })
      .catch(() => next(new Error('unauthorized')));
  });

  io.on('connection', async (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);
    const memberships = await prisma.boardMember.findMany({ where: { userId }, select: { boardId: true } });
    for (const m of memberships) socket.join(`board:${m.boardId}`);
    for (const m of memberships) void emitPresence(m.boardId);

    socket.on('presence:get', async (boardId: string, ack?: (ids: string[]) => void) => {
      if (typeof ack === 'function' && socket.rooms.has(`board:${boardId}`)) ack(await onlineUsers(boardId));
    });

    // Rooms are still readable during "disconnecting"; recompute presence once the socket is gone.
    socket.on('disconnecting', () => {
      const boards = [...socket.rooms].filter((r) => r.startsWith('board:')).map((r) => r.slice(6));
      setTimeout(() => boards.forEach((b) => void emitPresence(b)), 50);
    });
  });
}

async function onlineUsers(boardId: string): Promise<string[]> {
  if (!io) return [];
  const sockets = await io.in(`board:${boardId}`).fetchSockets();
  return [...new Set(sockets.map((s) => s.data.userId as string))];
}

async function emitPresence(boardId: string) {
  io?.to(`board:${boardId}`).emit('presence', { boardId, userIds: await onlineUsers(boardId) });
}

export type Log = { text: string; actorId: string; cardId?: string };

/** Sends the latest board to everyone on it. */
export async function broadcastBoard(boardId: string, log: Log | null) {
  if (!io) return;
  const snap = await boardSnapshot(boardId);
  if (!snap) return;
  const roles = new Map(snap.board.members.map((m) => [m.userId, m.role]));
  const sockets = await io.in(`board:${boardId}`).fetchSockets();
  for (const s of sockets) {
    const role = roles.get(s.data.userId as string);
    if (!role) continue; // removed but not yet out of the room
    s.emit('board:sync', { ...snap, board: forRole(snap.board, role), log });
  }
}

export function notifyUser(userId: string, notification: unknown) {
  io?.to(`user:${userId}`).emit('notification', notification);
}

/** A user just joined a board: their open tabs start receiving it. */
export async function addUserToBoardRoom(userId: string, boardId: string) {
  io?.in(`user:${userId}`).socketsJoin(`board:${boardId}`);
  await emitPresence(boardId);
}

export async function removeUserFromBoardRoom(userId: string, boardId: string) {
  io?.to(`user:${userId}`).emit('board:removed', { boardId });
  io?.in(`user:${userId}`).socketsLeave(`board:${boardId}`);
  await emitPresence(boardId);
}

export function boardDeleted(boardId: string) {
  io?.to(`board:${boardId}`).emit('board:removed', { boardId });
  io?.in(`board:${boardId}`).socketsLeave(`board:${boardId}`);
}

/** Logging out of one browser closes that browser's live connection. */
export async function disconnectSession(userId: string, sessionId: string) {
  if (!io) return;
  for (const s of await io.in(`user:${userId}`).fetchSockets()) if (s.data.sessionId === sessionId) s.disconnect(true);
}

/** Password reset / "log out everywhere": close every live connection of that user. */
export function disconnectUser(userId: string) {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
