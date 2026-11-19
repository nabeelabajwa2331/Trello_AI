import { useEffect } from 'react';
import { toast } from 'sonner';
import { subscribe } from '../lib/realtime';
import { useStore } from '../store/useStore';
import { firstName } from '../lib/id';

/** Applies board changes that arrive from other clients (other tabs now, Socket.IO later). */
export function useRealtimeSync() {
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type !== 'board:sync') return;
        const s = useStore.getState();
        s.applyRemote(e.board, e.log);
        if (e.log && location.pathname.startsWith(`/b/${e.board.id}`)) {
          const who = e.log.actorId === s.me ? 'You (another tab)' : firstName(s.users[e.log.actorId]?.name ?? 'Someone');
          toast(`${who} ${e.log.text}`);
        }
      }),
    [],
  );
}
