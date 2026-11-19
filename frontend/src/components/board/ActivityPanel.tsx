import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { Board } from '../../types';
import { useStore } from '../../store/useStore';
import { Avatar } from '../ui/Avatar';
import { ago } from '../../lib/dates';

type Group = { userId: string; items: Board['activity'] };

/** Consecutive actions by the same person within 10 minutes collapse into one group. */
function group(activity: Board['activity']): Group[] {
  const out: Group[] = [];
  for (const a of activity) {
    const last = out[out.length - 1];
    if (last && last.userId === a.userId && new Date(last.items[last.items.length - 1].createdAt).getTime() - new Date(a.createdAt).getTime() < 10 * 60_000) {
      last.items.push(a);
    } else out.push({ userId: a.userId, items: [a] });
  }
  return out;
}

export function ActivityPanel({ board, onClose }: { board: Board; onClose: () => void }) {
  const users = useStore((s) => s.users);
  const groups = useMemo(() => group(board.activity), [board.activity]);
  return createPortal(
    <div className="fixed inset-0 z-40 bg-[#1E1D1A]/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="absolute inset-y-0 right-0 flex w-[min(380px,100vw)] flex-col border-l border-line bg-surface shadow-pop" aria-label="Activity">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">Activity</h2>
          <button className="btn-quiet h-8 w-8 p-0" onClick={onClose} aria-label="Close activity">
            <X size={18} />
          </button>
        </div>
        <ol className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {groups.map((g) => (
            <li key={g.items[0].id} className="flex gap-3">
              <Avatar userId={g.userId} size="md" />
              <div className="min-w-0 flex-1 text-sm">
                <b>{users[g.userId]?.name ?? 'Someone'}</b>
                {g.items.length > 1 && <span className="text-muted"> made {g.items.length} changes</span>}
                <ul className="mt-1 flex flex-col gap-1">
                  {g.items.map((a) => (
                    <li key={a.id} className="text-muted">
                      {a.cardId && board.cards[a.cardId] && !board.cards[a.cardId].archived ? (
                        <Link to={`/b/${board.id}/c/${a.cardId}`} className="text-ink hover:underline">{a.text}</Link>
                      ) : (
                        <span className="text-ink">{a.text}</span>
                      )}
                      <span className="ml-1.5 font-mono text-[11px]">{ago(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
          {groups.length === 0 && <li className="text-muted">No activity yet. Changes to this board will show up here.</li>}
        </ol>
      </aside>
    </div>,
    document.body,
  );
}
