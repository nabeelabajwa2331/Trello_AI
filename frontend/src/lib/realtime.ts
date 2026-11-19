/**
 * Socket.IO connection. The server puts each socket in one room per board the user belongs to,
 * and pushes the full board after every change, so clients never drift apart.
 */
import { io, type Socket } from 'socket.io-client';
import type { Board, Notification, User } from '../types';

export type SyncEvent = { board: Board; users: Record<string, User>; log: { text: string; actorId: string; cardId?: string } | null };
export type InviteEvent = { type: 'invite'; invite: { id: string; fromUserId: string; role: string; boardTitle: string; boardCover: string } };

export interface Handlers {
  onSync: (e: SyncEvent) => void;
  onNotification: (n: Notification | InviteEvent) => void;
  onRemoved: (boardId: string) => void;
  onPresence: (boardId: string, userIds: string[]) => void;
  onStatus: (online: boolean) => void;
  onReconnect: () => void;
  /** The server closed the connection on purpose (logged out everywhere, password reset). */
  onKicked: () => void;
}

let socket: Socket | null = null;

export function connectRealtime(h: Handlers) {
  socket?.disconnect();
  socket = io(import.meta.env.VITE_SOCKET_URL ?? '/', { withCredentials: true, transports: ['websocket', 'polling'] });
  let wasConnected = false;
  socket.on('connect', () => {
    h.onStatus(true);
    if (wasConnected) h.onReconnect(); // we may have missed changes while offline
    wasConnected = true;
  });
  socket.on('disconnect', (reason) => {
    // "io server disconnect" means the server ended it on purpose; Socket.IO won't retry by itself.
    if (reason === 'io server disconnect') h.onKicked();
    else h.onStatus(false);
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') h.onKicked();
    else h.onStatus(false);
  });
  socket.on('board:sync', h.onSync);
  socket.on('notification', h.onNotification);
  socket.on('board:removed', ({ boardId }: { boardId: string }) => h.onRemoved(boardId));
  socket.on('presence', ({ boardId, userIds }: { boardId: string; userIds: string[] }) => h.onPresence(boardId, userIds));
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

export function requestPresence(boardId: string, cb: (ids: string[]) => void) {
  socket?.emit('presence:get', boardId, cb);
}
