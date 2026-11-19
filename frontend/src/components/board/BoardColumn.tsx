import { useEffect, useRef, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CheckCircle2, MoreHorizontal, Plus, X } from 'lucide-react';
import type { Board, List } from '../../types';
import { CardTile } from './CardTile';
import { Popover, MenuItem } from '../ui/Popover';
import { useStore } from '../../store/useStore';

interface Props {
  board: Board;
  list: List;
  cardIds: string[];
  canEdit: boolean;
  canDrag: boolean;
  onOpenCard: (id: string) => void;
  overlay?: boolean;
}

export function BoardColumn({ board, list, cardIds, canEdit, canDrag, onOpenCard, overlay }: Props) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' },
    disabled: !canDrag,
  });
  const renameList = useStore((s) => s.renameList);
  const deleteList = useStore((s) => s.deleteList);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`${list.title}, ${cardIds.length} cards`}
      className={clsx(
        'flex max-h-full w-[min(288px,82vw)] shrink-0 flex-col rounded-col bg-column',
        isDragging && 'opacity-40',
        overlay && 'rotate-[1.5deg] shadow-lift',
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-1 pt-2.5" {...attributes} {...listeners} tabIndex={canDrag ? 0 : -1} aria-roledescription={canDrag ? 'Draggable list' : undefined}>
        {renaming ? (
          <InlineInput
            initial={list.title}
            onSave={(v) => {
              if (v && v !== list.title) renameList(board.id, list.id, v);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <h3
            className={clsx('flex min-w-0 flex-1 items-center gap-1.5 truncate font-sans text-sm font-semibold', canEdit && 'cursor-text')}
            onDoubleClick={() => canEdit && setRenaming(true)}
          >
            {list.isDone && <CheckCircle2 size={14} className="shrink-0 text-success" aria-label="Done list" />}
            {list.title}
          </h3>
        )}
        <span className="rounded-full border border-line bg-surface px-1.5 font-mono text-[11px] text-muted">{cardIds.length}</span>
        {canEdit && (
          <Popover
            align="right"
            className="w-52"
            trigger={({ toggle }) => (
              <button className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-line/60 hover:text-ink" onClick={toggle} onPointerDown={(e) => e.stopPropagation()} aria-label={`${list.title} list actions`}>
                <MoreHorizontal size={16} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem onClick={() => { setAdding(true); close(); }}>Add card</MenuItem>
                <MenuItem onClick={() => { setRenaming(true); close(); }}>Rename list</MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    if (list.cardIds.length) return void toast('Move or archive the cards in this list first, then delete it.');
                    deleteList(board.id, list.id);
                  }}
                >
                  Delete list
                </MenuItem>
              </>
            )}
          </Popover>
        )}
      </header>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[12px] flex-col gap-2 overflow-y-auto px-2 pb-1 pt-1.5">
          {cardIds.map((id) =>
            board.cards[id] ? <CardTile key={id} card={board.cards[id]} listId={list.id} done={!!list.isDone} canDrag={canDrag} onOpen={onOpenCard} /> : null,
          )}
          {cardIds.length === 0 && !adding && (
            <div className="rounded-card border border-dashed border-muted/50 px-3 py-4 text-center text-xs text-muted">{canDrag ? 'Drop cards here' : 'No cards'}</div>
          )}
        </div>
      </SortableContext>

      {canEdit && (
        <div className="p-2">
          {adding ? <AddCardForm boardId={board.id} listId={list.id} onDone={() => setAdding(false)} /> : (
            <button className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-line/60 hover:text-ink" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add a card
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AddCardForm({ boardId, listId, onDone }: { boardId: string; listId: string; onDone: () => void }) {
  const addCard = useStore((s) => s.addCard);
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = () => {
    const v = value.trim();
    if (!v) return onDone();
    addCard(boardId, listId, v);
    setValue(''); // keep the form open for the next card
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        id={`add-card-${listId}`}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
          if (e.key === 'Escape') onDone();
        }}
        placeholder="What needs doing?"
        className="input resize-none"
        maxLength={200}
      />
      <div className="flex items-center gap-2">
        <button className="btn-primary px-3 py-1.5" onMouseDown={(e) => e.preventDefault()} onClick={save}>
          Add card
        </button>
        <button className="btn-quiet h-8 w-8 p-0" onClick={onDone} aria-label="Cancel">
          <X size={17} />
        </button>
        <span className="ml-auto text-[11px] text-muted">Enter to add</span>
      </div>
    </div>
  );
}

export function InlineInput({ initial, onSave, onCancel, className }: { initial: string; onSave: (v: string) => void; onCancel: () => void; className?: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(v.trim());
        if (e.key === 'Escape') onCancel();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={clsx('input h-8 flex-1 px-2 py-1 font-semibold', className)}
      maxLength={60}
    />
  );
}
