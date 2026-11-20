import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Avatar } from './ui/Avatar';
import { firstName } from '../lib/id';

/** elsewhere: your own change, made on another tab or device. */
type Activity = { actorId: string; text: string; boardId: string; cardId?: string; elsewhere?: boolean };

/** Small bottom-right popup: who did what, on which board. Tap to open the card. */
function ActivityToast({ id, a }: { id: string | number; a: Activity }) {
  const navigate = useNavigate();
  const name = useStore((s) => firstName(s.users[a.actorId]?.name ?? 'Someone'));
  const who = a.elsewhere ? 'You (on another tab or device)' : name;
  const board = useStore((s) => s.boards[a.boardId]);
  const parts = a.text.split(/“([^”]+)”/g);

  return (
    <button
      type="button"
      onClick={() => {
        toast.dismiss(id);
        navigate(
          a.cardId && board?.cards[a.cardId] && !board.cards[a.cardId].archived ? `/b/${a.boardId}/c/${a.cardId}` : `/b/${a.boardId}`,
        );
      }}
      className="flex w-[min(360px,calc(100vw-32px))] items-start gap-3 rounded-[12px] border border-ink bg-surface p-3 text-left text-sm text-ink shadow-hard"
    >
      <Avatar userId={a.actorId} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block leading-snug">
          <b className="font-semibold">{who}</b>{' '}
          {parts.map((p, i) =>
            i % 2 ? (
              <b key={i} className="font-semibold">
                “{p}”
              </b>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </span>
        {board && (
          <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: board.cover }} />
            {board.title}
          </span>
        )}
      </span>
    </button>
  );
}

export function showActivity(a: Activity) {
  toast.custom((id) => <ActivityToast id={id} a={a} />, { duration: 5000 });
}
