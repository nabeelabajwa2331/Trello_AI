import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { Hand, Play, RotateCcw } from 'lucide-react';
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

function SortableCard({ id, done, ghosted }: { id: string; done: boolean; ghosted: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-card-id={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={CARDS[id].title}
      className={clsx('cursor-grab touch-manipulation rounded-card', (isDragging || ghosted) && 'opacity-30')}
    >
      <CardFace id={id} done={done} />
    </div>
  );
}

function Column({ title, ids, ghostId }: { title: string; ids: string[]; ghostId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: title });
  return (
    <div ref={setNodeRef} data-col={title} className={clsx('flex min-w-0 flex-col gap-2 rounded-col bg-column p-2.5', isOver && 'outline outline-2 outline-ink')}>
      <div className="flex items-center justify-between px-1 text-xs font-semibold">
        {title}
        <span className="font-mono text-[11px] text-muted">{ids.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div data-drop-area className="flex min-h-[90px] flex-col gap-2">
          {ids.map((id) => <SortableCard key={id} id={id} done={title === 'Done'} ghosted={id === ghostId} />)}
          {ids.length === 0 && <div className="grid flex-1 place-items-center rounded-card border border-dashed border-muted/50 text-xs text-muted">Drop here</div>}
        </div>
      </SortableContext>
    </div>
  );
}

/* ------------------------------------------------------------------ the hint */

type Hint = { id: string; from: { x: number; y: number; w: number }; to: { x: number; y: number }; target: string };

const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A pretend hand picks up the first card, carries it to the next list and drops it.
 * Nothing actually moves: it's a picture of the gesture, played over the real board.
 */
function HintGhost({ hint, onDone }: { hint: Hint; onDone: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const dx = hint.to.x - hint.from.x;
    const dy = hint.to.y - hint.from.y;
    const timing: KeyframeAnimationOptions = { duration: 2600, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' };
    const a = card.current?.animate(
      [
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 0, offset: 0 },
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(0,-6px) rotate(2.5deg) scale(1.03)', opacity: 1, offset: 0.24 },
        { transform: `translate(${dx}px,${dy - 6}px) rotate(2.5deg) scale(1.03)`, opacity: 1, offset: 0.72 },
        { transform: `translate(${dx}px,${dy}px) rotate(0) scale(1)`, opacity: 1, offset: 0.82 },
        { transform: `translate(${dx}px,${dy}px) rotate(0) scale(1)`, opacity: 0, offset: 1 },
      ],
      timing,
    );
    hand.current?.animate(
      [
        { transform: 'translate(20px,24px) scale(1)', opacity: 0, offset: 0 },
        { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(0,-6px) scale(0.88)', opacity: 1, offset: 0.24 }, // "grab"
        { transform: `translate(${dx}px,${dy - 6}px) scale(0.88)`, opacity: 1, offset: 0.72 },
        { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 1, offset: 0.82 }, // "let go"
        { transform: `translate(${dx + 16}px,${dy + 18}px) scale(1)`, opacity: 0, offset: 1 },
      ],
      timing,
    );
    if (a) a.onfinish = () => done.current();
    else done.current();
    return () => a?.cancel();
  }, [hint]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      <div ref={card} className="absolute opacity-0" style={{ left: hint.from.x, top: hint.from.y, width: hint.from.w }}>
        <div className="rounded-card shadow-lift">
          <CardFace id={hint.id} done={false} />
        </div>
      </div>
      <div ref={hand} className="absolute opacity-0" style={{ left: hint.from.x + hint.from.w * 0.62, top: hint.from.y + 26 }}>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-ink bg-accent text-on-accent shadow-hard">
          <Hand size={18} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ board */

export function DemoBoard() {
  const [cols, setCols] = useState(START);
  const [active, setActive] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [phase, setPhase] = useState<'idle' | 'showing' | 'your-turn' | 'tried'>('idle');
  const area = useRef<HTMLDivElement>(null);
  const plays = useRef(0);
  const touched = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const find = (id: string) => (id in cols ? id : COLS.find((c) => cols[c].includes(id)));

  /** Measure the real card and the bottom of the next list, then play the ghost between them. */
  const playHint = useCallback(() => {
    const root = area.current;
    if (!root || touched.current) return;
    const from = COLS.slice(0, -1).find((c) => cols[c].length > 0);
    if (!from) return;
    const target = COLS[COLS.indexOf(from) + 1];
    const id = cols[from][0];
    const src = root.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
    const drop = root.querySelector<HTMLElement>(`[data-col="${target}"] [data-drop-area]`);
    if (!src || !drop) return;
    const base = root.getBoundingClientRect();
    const s = src.getBoundingClientRect();
    const last = drop.lastElementChild?.getBoundingClientRect();
    const toY = last ? last.bottom + 8 : drop.getBoundingClientRect().top;
    plays.current++;
    setPhase('showing');
    setHint({ id, target, from: { x: s.left - base.left, y: s.top - base.top, w: s.width }, to: { x: drop.getBoundingClientRect().left - base.left, y: toY - base.top } });
  }, [cols]);

  // Play once when the board scrolls into view, and once more a little later if nobody has tried yet.
  useEffect(() => {
    const root = area.current;
    if (!root || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && plays.current === 0) t = setTimeout(playHint, 700);
      },
      { threshold: 0.6 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, [playHint]);

  useEffect(() => {
    if (phase !== 'your-turn' || plays.current >= 2) return;
    const t = setTimeout(() => !touched.current && playHint(), 9000);
    return () => clearTimeout(t);
  }, [phase, playHint]);

  const stopHint = () => {
    touched.current = true;
    setHint(null);
    setPhase('tried');
  };

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

  const caption =
    done === total
      ? 'Everything is done. Go to sleep.'
      : phase === 'showing'
        ? `Like this: grab a card, carry it to “${hint?.target ?? 'Doing'}”, let go.`
        : phase === 'your-turn'
          ? 'Your turn. Drag any card to another list.'
          : changed
            ? 'Nothing here is saved, so go ahead and move things around.'
            : 'Drag the cards between lists. Nothing here is saved.';

  return (
    <div className="rounded-modal border border-ink bg-surface p-3 shadow-hard sm:p-4">
      <div className="flex flex-wrap items-center gap-3 px-1 pb-3">
        <span className="font-display text-[15px] font-bold">SOC-210 Group Report</span>
        <span className="font-mono text-xs text-muted">{done} of {total} done</span>
        <div className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-column">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {changed ? (
          <button className="btn-quiet h-8 px-2 text-xs" onClick={() => setCols(START)}>
            <RotateCcw size={13} /> Reset
          </button>
        ) : (
          phase !== 'showing' && (
            <button className="btn-quiet h-8 px-2 text-xs" onClick={() => { touched.current = false; playHint(); }}>
              <Play size={12} /> Show me how
            </button>
          )
        )}
      </div>

      <div ref={area} className="relative" onPointerDownCapture={stopHint} onKeyDownCapture={stopHint}>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setActive(String(e.active.id))} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {COLS.map((c) => <Column key={c} title={c} ids={cols[c]} ghostId={hint?.id ?? null} />)}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>{active ? <CardFace id={active} done={false} lifted /> : null}</DragOverlay>
        </DndContext>
        {hint && (
          <HintGhost
            hint={hint}
            onDone={() => {
              setHint(null);
              setPhase((p) => (p === 'showing' ? 'your-turn' : p));
            }}
          />
        )}
      </div>

      <p className={clsx('px-1 pt-3 text-xs', phase === 'your-turn' ? 'font-semibold text-ink' : 'text-muted')} aria-live="polite">
        {phase === 'your-turn' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent align-middle" />}
        {caption}
      </p>
    </div>
  );
}
