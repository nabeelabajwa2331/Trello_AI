import { useState } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RotateCcw } from 'lucide-react';
import type { LabelId } from '../../types';
import { LabelChip } from '../../components/ui/Chips';

type Tone = 'soon' | 'over' | 'normal';
type DemoCard = { title: string; label?: LabelId; due: string; tone: Tone; who: string; color: string };

const CARDS: Record<string, DemoCard> = {
  a: { title: 'Find 8 sources for the lit review', label: 'research', due: 'Tomorrow', tone: 'soon', who: 'AK', color: '#4F6C86' },
  b: { title: 'Presentation slides', label: 'slides', due: 'Fri', tone: 'normal', who: 'SR', color: '#A8574A' },
  c: { title: 'Clean the survey data', label: 'backend', due: '2 days late', tone: 'over', who: 'HM', color: '#5E7D57' },
  d: { title: 'Write the conclusion', label: 'docs', due: 'Sat', tone: 'normal', who: 'You', color: '#2A2926' },
  e: { title: 'Book a room for practice run', due: 'Thu', tone: 'normal', who: 'HM', color: '#5E7D57' },
  f: { title: 'Agree on the research question', label: 'research', due: 'Nov 10', tone: 'normal', who: 'AK', color: '#4F6C86' },
};
const START = { 'To do': ['a', 'c', 'd'], Doing: ['b', 'e'], Done: ['f'] } as Record<string, string[]>;
const COLS = Object.keys(START);

const toneClass: Record<Tone, string> = { soon: 'bg-soon text-soon-fg', over: 'bg-over text-over-fg', normal: 'bg-column text-muted' };

function CardFace({ id, done, lifted }: { id: string; done: boolean; lifted?: boolean }) {
  const c = CARDS[id];
  return (
    <div className={clsx('flex flex-col gap-2 rounded-card border bg-surface p-3 text-[13.5px] leading-snug', lifted ? 'rotate-[2.5deg] cursor-grabbing border-line shadow-lift' : 'border-line shadow-card transition-shadow hover:shadow-hover')}>
      {c.label && <LabelChip id={c.label} className="self-start" />}
      <span className={clsx(done && 'text-muted line-through')}>{c.title}</span>
      <span className="flex items-center justify-between">
        <span className={clsx('rounded px-1.5 py-px font-mono text-[10.5px]', done ? 'bg-done text-done-fg' : toneClass[c.tone])}>{done ? 'Done' : c.due}</span>
        <span className="grid h-6 min-w-6 place-items-center rounded-full px-1 text-[10px] font-semibold text-white" style={{ background: c.color }}>{c.who}</span>
      </span>
    </div>
  );
}

function SortableCard({ id, done }: { id: string; done: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={CARDS[id].title}
      className={clsx('cursor-grab touch-manipulation rounded-card', isDragging && 'opacity-30')}
    >
      <CardFace id={id} done={done} />
    </div>
  );
}

function Column({ title, ids }: { title: string; ids: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: title });
  return (
    <div ref={setNodeRef} className={clsx('flex min-w-0 flex-col gap-2 rounded-col bg-column p-2.5', isOver && 'outline outline-2 outline-ink')}>
      <div className="flex items-center justify-between px-1 text-xs font-semibold">
        {title}
        <span className="font-mono text-[11px] text-muted">{ids.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[90px] flex-col gap-2">
          {ids.map((id) => <SortableCard key={id} id={id} done={title === 'Done'} />)}
          {ids.length === 0 && <div className="grid flex-1 place-items-center rounded-card border border-dashed border-muted/50 text-xs text-muted">Drop here</div>}
        </div>
      </SortableContext>
    </div>
  );
}

export function DemoBoard() {
  const [cols, setCols] = useState(START);
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const find = (id: string) => (id in cols ? id : COLS.find((c) => cols[c].includes(id)));

  const onOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) return;
    const from = find(String(a.id)), to = find(String(over.id));
    if (!from || !to || from === to) return;
    setCols((p) => {
      const next = { ...p, [from]: p[from].filter((x) => x !== a.id), [to]: [...p[to]] };
      const i = next[to].indexOf(String(over.id));
      next[to].splice(i >= 0 ? i : next[to].length, 0, String(a.id));
      return next;
    });
  };
  const onEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    if (!over) return;
    const c = find(String(a.id));
    if (!c || c !== find(String(over.id))) return;
    const oldI = cols[c].indexOf(String(a.id)), newI = cols[c].indexOf(String(over.id));
    if (newI >= 0 && oldI !== newI) setCols((p) => ({ ...p, [c]: arrayMove(p[c], oldI, newI) }));
  };

  const total = Object.keys(CARDS).length;
  const done = cols.Done.length;
  const changed = JSON.stringify(cols) !== JSON.stringify(START);

  return (
    <div className="rounded-modal border border-ink bg-surface p-3 shadow-hard sm:p-4">
      <div className="flex flex-wrap items-center gap-3 px-1 pb-3">
        <span className="font-display text-[15px] font-bold">SOC-210 Group Report</span>
        <span className="font-mono text-xs text-muted">{done} of {total} done</span>
        <div className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-column">
          <div className="h-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {changed && (
          <button className="btn-quiet h-8 px-2 text-xs" onClick={() => setCols(START)}>
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setActive(String(e.active.id))} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {COLS.map((c) => <Column key={c} title={c} ids={cols[c]} />)}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>{active ? <CardFace id={active} done={false} lifted /> : null}</DragOverlay>
      </DndContext>
      <p className="px-1 pt-3 text-xs text-muted" aria-live="polite">
        {done === total ? 'Everything is done. Go to sleep.' : 'Drag the cards. Nothing here is saved, so go ahead.'}
      </p>
    </div>
  );
}
