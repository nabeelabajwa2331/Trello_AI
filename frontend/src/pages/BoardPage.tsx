import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  type CollisionDetection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Activity, Archive, Eye, Filter, LogOut, MoreHorizontal, Plus, Share2, Star, Trash2, X } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AppHeader } from '../components/AppHeader';
import { BoardColumn, InlineInput } from '../components/board/BoardColumn';
import { CardView } from '../components/board/CardTile';
import { CardModal } from '../components/board/CardModal';
import { ActivityPanel } from '../components/board/ActivityPanel';
import { ShareDialog } from '../components/board/ShareDialog';
import { AvatarStack } from '../components/ui/Avatar';
import { LabelChip } from '../components/ui/Chips';
import { Popover, MenuItem } from '../components/ui/Popover';
import { Dialog } from '../components/ui/Dialog';
import { ArchivePanel } from '../components/board/ArchivePanel';
import { useStore, useMyRole } from '../store/useStore';
import { requestPresence } from '../lib/realtime';
import { can } from '../lib/permissions';
import { LABEL_IDS } from '../lib/labels';
import type { Board, LabelId } from '../types';
import NotFound from './NotFound';

type Layout = Record<string, string[]>;

/** Lists only collide with other lists; cards use corner distance, which works well across columns. */
const collision: CollisionDetection = (args) =>
  args.active.data.current?.type === 'list'
    ? closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === 'list') })
    : closestCorners(args);
type DueFilter = 'any' | 'overdue' | 'week' | 'none';

export default function BoardPage() {
  const { boardId = '', cardId } = useParams();
  const navigate = useNavigate();
  const board = useStore((s) => s.boards[boardId]);
  const me = useStore((s) => s.me);
  const role = useMyRole(boardId);
  const online = useStore((s) => s.presence[boardId]);
  const applyLayout = useStore((s) => s.applyLayout);
  const reorderLists = useStore((s) => s.reorderLists);
  const addList = useStore((s) => s.addList);
  const renameBoard = useStore((s) => s.renameBoard);
  const toggleStar = useStore((s) => s.toggleStar);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const leaveBoard = useStore((s) => s.leaveBoard);

  // While dragging, the board renders from this local snapshot, so remote updates never yank a card out of your hand.
  const [dragLayout, setDragLayout] = useState<Layout | null>(null);
  const [dragLists, setDragLists] = useState<string[] | null>(null);
  const [active, setActive] = useState<{ id: string; type: 'card' | 'list'; fromList?: string } | null>(null);
  const [share, setShare] = useState(false);
  const [activity, setActivity] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [archive, setArchive] = useState(false);
  const [confirmExit, setConfirmExit] = useState<'delete' | 'leave' | null>(null);
  const lastDragEnd = useRef(0);

  // Filters
  const [fMine, setFMine] = useState(false);
  const [fLabels, setFLabels] = useState<LabelId[]>([]);
  const [fDue, setFDue] = useState<DueFilter>('any');
  const filtering = fMine || fLabels.length > 0 || fDue !== 'any';

  // Ask who is here right now; later changes arrive as "presence" events.
  useEffect(() => {
    if (boardId) requestPresence(boardId, (ids) => useStore.setState((s) => ({ presence: { ...s.presence, [boardId]: ids } })));
  }, [boardId]);

  useEffect(() => {
    if (board) document.title = `${board.title} · Crewboard`;
    return () => void (document.title = 'Crewboard');
  }, [board?.title]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(() => {
    if (!board) return {} as Layout;
    const pass = (id: string) => {
      const c = board.cards[id];
      if (!c) return false;
      if (fMine && !c.assignees.includes(me)) return false;
      if (fLabels.length && !fLabels.some((l) => c.labels.includes(l))) return false;
      if (fDue !== 'any') {
        if (fDue === 'none') return !c.due;
        if (!c.due) return false;
        const d = differenceInCalendarDays(parseISO(c.due), new Date());
        if (fDue === 'overdue' && d >= 0) return false;
        if (fDue === 'week' && (d < 0 || d > 7)) return false;
      }
      return true;
    };
    return Object.fromEntries(board.listOrder.map((l) => [l, board.lists[l].cardIds.filter(pass)]));
  }, [board, fMine, fLabels, fDue, me]);

  if (!board) return (<><AppHeader /><NotFound message="This board was deleted, or you are no longer a member." /></>);
  if (!role) return (<><AppHeader /><NotFound message="You don't have access to this board. Ask the owner for an invite." /></>);

  const canEdit = can(role, 'editCards');
  const archivedCount = Object.values(board.cards).filter((c) => c.archived).length;
  const canDrag = canEdit && !filtering; // reordering a filtered view would be confusing
  const layout = dragLayout ?? visible;
  const listOrder = dragLists ?? board.listOrder;
  const presence = board.members.map((m) => m.userId);

  const findContainer = (id: string, l: Layout) => (id in l ? id : Object.keys(l).find((k) => l[k].includes(id)));

  const onDragStart = (e: DragStartEvent) => {
    const type = e.active.data.current?.type as 'card' | 'list';
    if (type === 'card') {
      const snap = structuredClone(visible);
      setDragLayout(snap);
      setActive({ id: String(e.active.id), type, fromList: findContainer(String(e.active.id), snap) });
    } else {
      setDragLists(board.listOrder);
      setActive({ id: String(e.active.id), type });
    }
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over || a.data.current?.type !== 'card') return;
    setDragLayout((prev) => {
      if (!prev) return prev;
      const from = findContainer(String(a.id), prev);
      const to = findContainer(String(over.id), prev);
      if (!from || !to || from === to) return prev;
      const next = { ...prev, [from]: prev[from].filter((x) => x !== a.id), [to]: [...prev[to]] };
      const overIndex = next[to].indexOf(String(over.id));
      next[to].splice(overIndex >= 0 ? overIndex : next[to].length, 0, String(a.id));
      return next;
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const type = a.data.current?.type;
    if (type === 'list' && dragLists) {
      if (over && a.id !== over.id) {
        const oldI = dragLists.indexOf(String(a.id));
        const newI = dragLists.indexOf(String(over.id));
        if (newI >= 0) reorderLists(board.id, arrayMove(dragLists, oldI, newI));
      }
    } else if (type === 'card' && dragLayout && active?.fromList) {
      let next = dragLayout;
      if (over) {
        const c = findContainer(String(a.id), next);
        if (c && c === findContainer(String(over.id), next)) {
          const oldI = next[c].indexOf(String(a.id));
          const newI = next[c].indexOf(String(over.id));
          if (newI >= 0 && oldI !== newI) next = { ...next, [c]: arrayMove(next[c], oldI, newI) };
        }
      }
      // Optimistic update. With a real API: call it here and roll back with a toast on failure.
      try {
        applyLayout(board.id, next, String(a.id), active.fromList);
      } catch {
        toast.error(`Couldn't move the card. It's back where it was.`);
      }
    }
    lastDragEnd.current = Date.now();
    setDragLayout(null);
    setDragLists(null);
    setActive(null);
  };

  const onDragCancel = () => {
    setDragLayout(null);
    setDragLists(null);
    setActive(null);
  };

  // The pointer-up that ends a drag can also fire a click on the card; ignore it.
  const openCard = (id: string) => {
    if (Date.now() - lastDragEnd.current < 250) return;
    navigate(`/b/${board.id}/c/${id}`);
  };
  const activeCard = active?.type === 'card' ? board.cards[active.id] : null;
  const activeList = active?.type === 'list' ? board.lists[active.id] : null;

  return (
    <div className="flex h-[100dvh] flex-col">
      <AppHeader />

      {/* ---------- Board toolbar ---------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <span className="h-3 w-3 shrink-0 rounded" style={{ background: board.cover }} />
        {renaming ? (
          <div className="w-64">
            <InlineInput initial={board.title} onSave={(v) => { if (v && v !== board.title) renameBoard(board.id, v); setRenaming(false); }} onCancel={() => setRenaming(false)} className="text-base" />
          </div>
        ) : (
          <h1
            className={clsx('truncate rounded-md px-1.5 py-0.5 text-lg font-bold', can(role, 'editBoard') && 'cursor-text hover:bg-column')}
            onClick={() => can(role, 'editBoard') && setRenaming(true)}
            title={can(role, 'editBoard') ? 'Click to rename' : undefined}
          >
            {board.title}
          </h1>
        )}
        <button className={clsx('btn-quiet h-8 w-8 p-0', board.starred && 'text-warning')} onClick={() => toggleStar(board.id)} aria-label={board.starred ? 'Unstar board' : 'Star board'} aria-pressed={board.starred}>
          <Star size={17} fill={board.starred ? 'currentColor' : 'none'} />
        </button>
        {role === 'viewer' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-column px-2.5 py-1 text-xs font-semibold text-muted"><Eye size={13} /> View only</span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="mr-2 hidden items-center gap-2.5 sm:flex" title="People on this board. A green dot means they have it open.">
            <AvatarStack ids={presence} max={5} online={online ?? [me]} />
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-success" /> {(online ?? [me]).length} here
            </span>
          </span>
          <FilterMenu
            mine={fMine} setMine={setFMine} labels={fLabels} setLabels={setFLabels} due={fDue} setDue={setFDue}
            active={filtering}
            clear={() => { setFMine(false); setFLabels([]); setFDue('any'); }}
          />
          <button className="btn-quiet gap-1.5 px-2.5" onClick={() => setActivity(true)}>
            <Activity size={16} /> <span className="hidden md:inline">Activity</span>
          </button>
          <button className="btn-primary px-3 py-1.5" onClick={() => setShare(true)}>
            <Share2 size={15} /> Share
          </button>
          <Popover
            align="right"
            className="w-56"
            trigger={({ toggle }) => (
              <button className="btn-quiet h-9 w-9 p-0" onClick={toggle} aria-label="Board menu">
                <MoreHorizontal size={18} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem onClick={() => { close(); setArchive(true); }}>
                  <Archive size={15} /> Archived cards
                  {archivedCount > 0 && <span className="ml-auto font-mono text-xs text-muted">{archivedCount}</span>}
                </MenuItem>
                <div className="my-1 border-t border-line" />
                {role === 'owner' ? (
                  <MenuItem danger onClick={() => { close(); setConfirmExit('delete'); }}>
                    <Trash2 size={15} /> Delete board
                  </MenuItem>
                ) : (
                  <MenuItem danger onClick={() => { close(); setConfirmExit('leave'); }}>
                    <LogOut size={15} /> Leave board
                  </MenuItem>
                )}
              </>
            )}
          </Popover>
        </div>
      </div>

      {filtering && (
        <div className="flex items-center gap-2 border-b border-line bg-accent-soft/70 px-4 py-2 text-sm sm:px-6">
          <Filter size={14} /> Showing filtered cards. Dragging is paused while a filter is on.
          <button className="ml-auto font-semibold underline-offset-2 hover:underline" onClick={() => { setFMine(false); setFLabels([]); setFDue('any'); }}>Clear filters</button>
        </div>
      )}

      {/* ---------- Lists ---------- */}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}
        accessibility={{
          announcements: {
            onDragStart: ({ active: a }) => `Picked up ${a.data.current?.type === 'list' ? 'list' : 'card'} ${labelOf(board, String(a.id))}.`,
            onDragOver: ({ over }) => (over ? `Over ${labelOf(board, String(over.id))}.` : 'Not over a list.'),
            onDragEnd: ({ over }) => (over ? `Dropped on ${labelOf(board, String(over.id))}.` : 'Dropped.'),
            onDragCancel: () => 'Move cancelled.',
          },
        }}
      >
        <main className="board-scroll flex flex-1 items-start gap-3 overflow-x-auto px-4 py-4 sm:px-6">
          <SortableContext items={listOrder} strategy={horizontalListSortingStrategy}>
            {listOrder.map((lid) =>
              board.lists[lid] ? (
                <BoardColumn key={lid} board={board} list={board.lists[lid]} cardIds={layout[lid] ?? []} canEdit={canEdit} canDrag={canDrag} onOpenCard={openCard} />
              ) : null,
            )}
          </SortableContext>

          {can(role, 'editLists') && (
            <div className="w-[min(288px,82vw)] shrink-0">
              {addingList ? (
                <div className="rounded-col bg-column p-2">
                  <InlineInput initial="" onSave={(v) => { if (v) addList(board.id, v); setAddingList(false); }} onCancel={() => setAddingList(false)} />
                  <p className="px-1 pt-1.5 text-[11px] text-muted">Enter to add, Esc to cancel</p>
                </div>
              ) : (
                <button className="flex w-full items-center gap-2 rounded-col border-2 border-dashed border-line px-3 py-2.5 text-sm font-semibold text-muted hover:border-ink hover:text-ink" onClick={() => setAddingList(true)}>
                  <Plus size={16} /> Add a list
                </button>
              )}
            </div>
          )}
        </main>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
          {activeCard ? (
            <div className="w-[min(272px,78vw)]"><CardView card={activeCard} done={false} overlay /></div>
          ) : activeList ? (
            <BoardColumn board={board} list={activeList} cardIds={visible[activeList.id] ?? []} canEdit={false} canDrag={false} onOpenCard={() => {}} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {cardId && <CardModal board={board} cardId={cardId} role={role} onClose={() => navigate(`/b/${board.id}`)} />}
      {activity && <ActivityPanel board={board} onClose={() => setActivity(false)} />}
      {archive && <ArchivePanel board={board} canEdit={canEdit} onClose={() => setArchive(false)} />}
      <ExitDialog
        mode={confirmExit}
        boardTitle={board.title}
        onClose={() => setConfirmExit(null)}
        onConfirm={async () => {
          const deleting = confirmExit === 'delete';
          const ok = deleting ? await deleteBoard(board.id) : await leaveBoard(board.id);
          if (!ok) return;
          toast(deleting ? `Deleted “${board.title}”` : `You left “${board.title}”`);
          navigate('/boards', { replace: true });
        }}
      />
      <ShareDialog board={board} myRole={role} open={share} onClose={() => setShare(false)} />
    </div>
  );
}

/** Delete asks you to type the board name; leave is a plain confirmation. */
function ExitDialog({ mode, boardTitle, onClose, onConfirm }: { mode: 'delete' | 'leave' | null; boardTitle: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode) setTyped('');
  }, [mode]);
  const deleting = mode === 'delete';
  const ready = !deleting || typed.trim() === boardTitle.trim();
  return (
    <Dialog open={!!mode} onClose={onClose} title={deleting ? 'Delete this board?' : 'Leave this board?'}>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready || busy) return;
          setBusy(true);
          await onConfirm();
          setBusy(false);
        }}
      >
        {deleting ? (
          <>
            <p>
              This permanently deletes <b>“{boardTitle}”</b> with all its lists, cards, comments and activity, for everyone on it. It can’t be undone.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-board-name" className="text-sm font-semibold">Type the board name to confirm</label>
              <input id="confirm-board-name" data-autofocus className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={boardTitle} autoComplete="off" />
            </div>
          </>
        ) : (
          <p>
            You’ll lose access to <b>“{boardTitle}”</b> and be removed from its cards. Someone who can invite people will have to add you again if you want back in.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-danger" disabled={!ready || busy}>
            {busy ? 'One moment…' : deleting ? 'Delete board' : 'Leave board'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function labelOf(board: Board, id: string) {
  return board.cards[id]?.title ?? board.lists[id]?.title ?? '';
}

function FilterMenu(props: {
  mine: boolean; setMine: (v: boolean) => void;
  labels: LabelId[]; setLabels: (v: LabelId[]) => void;
  due: DueFilter; setDue: (v: DueFilter) => void;
  active: boolean; clear: () => void;
}) {
  const count = (props.mine ? 1 : 0) + props.labels.length + (props.due !== 'any' ? 1 : 0);
  return (
    <Popover
      align="right"
      className="w-72"
      trigger={({ toggle }) => (
        <button className={clsx('btn-quiet gap-1.5 px-2.5', props.active && 'bg-accent-soft text-ink')} onClick={toggle}>
          <Filter size={16} /> <span className="hidden md:inline">Filter</span>
          {count > 0 && <span className="rounded-full bg-ink px-1.5 font-mono text-[10px] text-surface">{count}</span>}
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col gap-3 p-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" id="f-mine" checked={props.mine} onChange={(e) => props.setMine(e.target.checked)} className="h-4 w-4 accent-[#2A2926]" />
            Only cards assigned to me
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="label-text">Due date</span>
            <div className="flex flex-wrap gap-1.5">
              {([['any', 'Any'], ['overdue', 'Overdue'], ['week', 'Next 7 days'], ['none', 'No date']] as [DueFilter, string][]).map(([v, l]) => (
                <button key={v} onClick={() => props.setDue(v)} className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', props.due === v ? 'border-ink bg-ink text-surface' : 'border-line hover:bg-column')}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-text">Labels</span>
            <div className="flex flex-wrap gap-1.5">
              {LABEL_IDS.map((l) => {
                const on = props.labels.includes(l);
                return (
                  <button key={l} aria-pressed={on} onClick={() => props.setLabels(on ? props.labels.filter((x) => x !== l) : [...props.labels, l])} className={clsx('rounded-md ring-offset-1 ring-offset-surface', on ? 'ring-2 ring-ink' : 'opacity-70 hover:opacity-100')}>
                    <LabelChip id={l} />
                  </button>
                );
              })}
            </div>
          </div>
          {props.active && (
            <button className="btn-quiet justify-start gap-1.5 px-1 text-xs" onClick={props.clear}><X size={13} /> Clear all filters</button>
          )}
        </div>
      )}
    </Popover>
  );
}
