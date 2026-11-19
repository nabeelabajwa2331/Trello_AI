import { memo, useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { AlignLeft, MessageSquare } from 'lucide-react';
import type { Card } from '../../types';
import { LabelChip, DueChip } from '../ui/Chips';
import { AvatarStack } from '../ui/Avatar';
import { useStore } from '../../store/useStore';

interface ViewProps {
  card: Card;
  done: boolean;
  overlay?: boolean;
  dragging?: boolean;
}

/** Pure visual of a card, shared by the list and the drag overlay. */
export function CardView({ card, done, overlay, dragging }: ViewProps) {
  const flashAt = useStore((s) => (s.flash?.cardId === card.id ? s.flash.at : 0));
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!flashAt || Date.now() - flashAt > 1500) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1200);
    return () => clearTimeout(t);
  }, [flashAt]);

  const hasMeta = card.due || card.comments.length > 0 || card.description || card.assignees.length > 0;
  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-card border border-line bg-surface p-2.5 text-[13.5px] leading-snug shadow-card transition-shadow hover:shadow-hover',
        overlay && 'rotate-[2.5deg] cursor-grabbing shadow-lift',
        dragging && 'opacity-0',
        flashing && 'animate-flash',
      )}
    >
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <LabelChip key={l} id={l} />
          ))}
        </div>
      )}
      <span className={clsx('break-words', done && 'text-muted line-through decoration-muted/60')}>{card.title}</span>
      {hasMeta && (
        <div className="flex items-center gap-2 text-muted">
          <DueChip due={card.due} done={done} />
          {card.description && <AlignLeft size={13} aria-label="Has description" />}
          {card.comments.length > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px]" aria-label={`${card.comments.length} comments`}>
              <MessageSquare size={12} /> {card.comments.length}
            </span>
          )}
          <span className="ml-auto">
            <AvatarStack ids={card.assignees} size="xs" max={3} />
          </span>
        </div>
      )}
    </div>
  );
}

interface TileProps {
  card: Card;
  listId: string;
  done: boolean;
  canDrag: boolean;
  onOpen: (id: string) => void;
}

export const CardTile = memo(function CardTile({ card, listId, done, canDrag, onOpen }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId },
    disabled: !canDrag,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      aria-roledescription={canDrag ? 'Draggable card' : undefined}
      aria-label={card.title}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => {
        // dnd-kit uses Space to pick up; Enter opens the card.
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(card.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className={clsx('rounded-card outline-none focus-visible:ring-2 focus-visible:ring-focus', canDrag ? 'cursor-grab touch-manipulation' : 'cursor-pointer')}
    >
      <CardView card={card} done={done} dragging={isDragging} />
    </div>
  );
});
