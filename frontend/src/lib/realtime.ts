/**
 * Real-time transport.
 *
 * Right now this uses BroadcastChannel, so two browser tabs on the same machine sync live.
 * When the backend exists, replace the body of these three functions with Socket.IO:
 *
 *   const socket = io(import.meta.env.VITE_API_URL, { withCredentials: true });
 *   joinBoard  -> socket.emit('board:join', boardId)
 *   publish    -> socket.emit(event.type, event)
 *   subscribe  -> socket.on('board:event', handler)
 *
 * Nothing else in the app needs to change.
 */
import type { Board } from '../types';

export type RealtimeEvent = {
  type: 'board:sync';
  board: Board;
  log: { text: string; actorId: string; cardId?: string } | null;
  origin: string;
};

const TAB_ID = Math.random().toString(36).slice(2);
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('crewboard') : null;

export function publish(event: Omit<RealtimeEvent, 'origin'>) {
  try {
    channel?.postMessage({ ...event, origin: TAB_ID });
  } catch {
    /* ignore: data could not be cloned */
  }
}

export function subscribe(handler: (e: RealtimeEvent) => void): () => void {
  if (!channel) return () => {};
  const listener = (msg: MessageEvent<RealtimeEvent>) => {
    if (msg.data?.origin !== TAB_ID) handler(msg.data);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

export const isRealtimeAvailable = !!channel;
