import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Archive, RotateCcw, X } from 'lucide-react';
import type { Board } from '../../types';
import { useStore } from '../../store/useStore';
import { LabelChip } from '../ui/Chips';

/** Every archived card on the board, newest first, with Restore for people who can edit. */
export function ArchivePanel({ board, canEdit, onClose }: { board: Board; canEdit: boolean; onClose: () => void }) {
  const restore = useStore((s) => s.restoreCard);
  const archived = Object.values(board.cards)
    .filter((c) => c.archived)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return createPortal(
    <div className="fixed inset-0 z-40 bg-[#1E1D1A]/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="absolute inset-y-0 right-0 flex w-[min(380px,100vw)] flex-col border-l border-line bg-surface shadow-pop" aria-label="Archived cards">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Archive size={18} className="text-muted" /> Archive
            <span className="font-mono text-xs font-normal text-muted">{archived.length}</span>
          </h2>
          <button className="btn-quiet h-8 w-8 p-0" onClick={onClose} aria-label="Close archive">
            <X size={18} />
          </button>
        </div>
        {archived.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No archived cards. When someone archives a card it waits here, and anyone who can edit the board can restore it.</p>
        ) : (
          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
            {archived.map((c) => {
              const from = c.archivedFrom ? board.lists[c.archivedFrom]?.title : undefined;
              return (
                <li key={c.id} className="flex flex-col gap-2 rounded-card border border-line bg-bg p-3">
                  {c.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.labels.map((l) => <LabelChip key={l} id={l} />)}
                    </div>
                  )}
                  <Link to={`/b/${board.id}/c/${c.id}`} className="text-sm font-medium hover:underline">{c.title}</Link>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{from ? `Was in ${from}` : 'Its list was deleted'}</span>
                    {canEdit && (
                      <button
                        className="btn-ghost h-8 px-2.5 text-xs"
                        onClick={() => {
                          restore(board.id, c.id);
                          toast(`Restored “${c.title}”${from ? ` to ${from}` : ''}`);
                        }}
                      >
                        <RotateCcw size={13} /> Restore
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>,
    document.body,
  );
}
