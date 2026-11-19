import { useEffect } from 'react';
import { toast } from 'sonner';
import { useStore, findListOf } from '../store/useStore';
import { firstName } from '../lib/id';

const COMMENTS = [
  'I can pick this up after my 2pm class.',
  'Pushed a first version, please review.',
  '@{me} can you check this before Friday?',
  'Blocked on this until the API is ready.',
  'Done from my side 👍',
];

/**
 * Demo only: pretends a teammate is working on the board so the live features are visible
 * without a second person. Remove once the Socket.IO backend is connected.
 */
export function useTeammateSim(boardId: string | undefined, paused: boolean) {
  const enabled = useStore((s) => s.simulateTeammates);
  useEffect(() => {
    if (!boardId || !enabled) return;
    const tick = () => {
      if (paused || document.hidden) return;
      const s = useStore.getState();
      const b = s.boards[boardId];
      if (!b) return;
      const mates = b.members.map((m) => m.userId).filter((id) => id !== s.me && m(b, id));
      if (!mates.length || b.listOrder.length < 2) return;
      const actor = mates[Math.floor(Math.random() * mates.length)];
      const cardIds = b.listOrder.flatMap((l) => b.lists[l].cardIds);
      if (!cardIds.length) return;
      const cardId = cardIds[Math.floor(Math.random() * cardIds.length)];
      const who = firstName(s.users[actor]?.name ?? 'A teammate');
      const title = b.cards[cardId].title;

      if (Math.random() < 0.7) {
        const from = findListOf(b, cardId)!;
        const i = b.listOrder.indexOf(from);
        const to = b.listOrder[i + 1] ?? b.listOrder[i - 1];
        s.moveCard(boardId, cardId, to, actor);
        toast(`${who} moved “${title}” to ${b.lists[to].title}`);
      } else {
        const text = COMMENTS[Math.floor(Math.random() * COMMENTS.length)].replace('{me}', firstName(s.users[s.me].name));
        s.addComment(boardId, cardId, text, actor);
        useStore.setState({ flash: { cardId, at: Date.now() } });
        toast(`${who} commented on “${title}”`);
      }
    };
    const id = setInterval(tick, 14000);
    return () => clearInterval(id);
  }, [boardId, enabled, paused]);
}

/** Viewers never make changes, so they are never simulated as actors. */
function m(b: { members: { userId: string; role: string }[] }, id: string) {
  return b.members.find((x) => x.userId === id)?.role !== 'viewer';
}
