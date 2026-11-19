import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { prisma } from './db.js';
import { env } from './env.js';
import { COOKIE, verifyToken } from './auth.js';
import { boardSnapshot } from './snapshot.js';

/**
 * Rooms:
 *   user:<id>   every socket of one user (notifications, membership changes)
 *   board:<id>  everyone currently able to see a board (board changes, presence)
 */
let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.clientOrigin, credentials: true } });

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const userId = verifyToken(cookies[COOKIE]);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
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

/** Sends the latest board to everyone on it. The sender gets it too and treats it as the source of truth. */
export async function broadcastBoard(boardId: string, log: Log | null) {
  if (!io) return;
  const snap = await boardSnapshot(boardId);
  if (snap) io.to(`board:${boardId}`).emit('board:sync', { ...snap, log });
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
