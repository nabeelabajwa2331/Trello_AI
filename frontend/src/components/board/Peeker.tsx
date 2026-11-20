import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '../../types';
import { dueStatus } from '../../lib/dates';
import { useStore } from '../../store/useStore';

const INK = '#2A2926';
const HEAD = 44;

type Creature = 'cat' | 'bear' | 'blob';
type Mood = 'happy' | 'eek' | 'oh';

const creatureFor = (id: string): Creature => (['cat', 'bear', 'blob'] as const)[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 3];

const LINES = ['👋 Hi!', '👀 Peekaboo!', '✨ You got this', '🙌 Go team!'];

/** What the character says, from the card's state. */
function reactionFor(card: Card, done: boolean, tap: number): { text: string; mood: Mood } {
  const due = dueStatus(card.due, done);
  if (done) return { text: '🎉 Done!', mood: 'happy' };
  if (due === 'over') return { text: '😬 It’s late!', mood: 'eek' };
  if (due === 'soon') return { text: '⏰ Due soon!', mood: 'oh' };
  if (card.comments.length) return { text: `💬 ${card.comments.length} comment${card.comments.length === 1 ? '' : 's'}`, mood: 'happy' };
  return { text: LINES[tap % LINES.length], mood: 'happy' };
}

function Face({ kind, color, mood }: { kind: Creature; color: string; mood: Mood }) {
  return (
    <svg viewBox="0 0 44 44" width={HEAD} height={HEAD} aria-hidden="true">
      {kind === 'cat' && (
        <>
          <path d="M8 20 L11 4 L20 13 Z" fill={color} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M36 20 L33 4 L24 13 Z" fill={color} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </>
      )}
      {kind === 'bear' && (
        <>
          <circle cx="10" cy="12" r="6" fill={color} stroke={INK} strokeWidth="2.5" />
          <circle cx="34" cy="12" r="6" fill={color} stroke={INK} strokeWidth="2.5" />
        </>
      )}
      {kind === 'blob' && (
        <>
          <path d="M22 12 L22 5" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="22" cy="4" r="3.5" fill="#F4C430" stroke={INK} strokeWidth="2" />
        </>
      )}
      <circle cx="22" cy="27" r="15.5" fill={color} stroke={INK} strokeWidth="2.5" />
      <circle cx="16.5" cy="25" r="2.4" fill={INK} />
      <circle cx="27.5" cy="25" r="2.4" fill={INK} />
      <ellipse cx="13" cy="31" rx="2.8" ry="1.7" fill="#E8836B" opacity="0.55" />
      <ellipse cx="31" cy="31" rx="2.8" ry="1.7" fill="#E8836B" opacity="0.55" />
      {mood === 'happy' && <path d="M17.5 31 Q22 36 26.5 31" stroke={INK} strokeWidth="2.3" fill="none" strokeLinecap="round" />}
      {mood === 'eek' && <rect x="16.5" y="30.5" width="11" height="4.5" rx="1.5" fill="#fff" stroke={INK} strokeWidth="2" />}
      {mood === 'oh' && <ellipse cx="22" cy="32.5" rx="2.6" ry="3" fill={INK} />}
    </svg>
  );
}

/**
 * A little character hiding behind the card; only its ears show above the top edge.
 * Tap them and its head pops up from behind the card with a reaction, then ducks back down.
 */
export function Peeker({ card, done }: { card: Card; done: boolean }) {
  const color = useStore((s) => (card.assignees[0] ? s.users[card.assignees[0]]?.color : undefined)) ?? '#F4C430';
  const kind = creatureFor(card.id);
  const anchor = useRef<HTMLSpanElement>(null);
  const [pop, setPop] = useState<{ x: number; y: number; text: string; mood: Mood } | null>(null);
  const taps = useRef(0);

  const stop = (e: SyntheticEvent) => e.stopPropagation(); // never start a drag or open the card

  return (
    <>
      <span
        ref={anchor}
        role="button"
        tabIndex={-1}
        aria-label="Peek"
        title="Someone’s hiding here"
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onKeyDown={stop}
        onClick={(e) => {
          e.stopPropagation();
          if (pop) return;
          const r = anchor.current!.getBoundingClientRect();
          const cardTop = (anchor.current!.parentElement as HTMLElement).getBoundingClientRect().top;
          setPop({ x: r.left, y: cardTop, ...reactionFor(card, done, taps.current++) });
        }}
        className="absolute -top-[8px] right-3 z-0 block h-[44px] w-[44px] cursor-pointer"
        style={{ visibility: pop ? 'hidden' : undefined }}
      >
        <Face kind={kind} color={color} mood="happy" />
      </span>
      {pop && <PeekPop {...pop} kind={kind} color={color} onDone={() => setPop(null)} />}
    </>
  );
}

/** The head rising out from behind the card edge, drawn above everything so a scrolling list can't clip it. */
function PeekPop({
  x,
  y,
  text,
  mood,
  kind,
  color,
  onDone,
}: {
  x: number;
  y: number;
  text: string;
  mood: Mood;
  kind: Creature;
  color: string;
  onDone: () => void;
}) {
  const head = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const up = head.current?.animate(
      [{ transform: 'translateY(80%)' }, { transform: 'translateY(-6%)', offset: 0.7 }, { transform: 'translateY(0)' }],
      { duration: reduce ? 1 : 380, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' },
    );
    bubble.current?.animate(
      [
        { opacity: 0, transform: 'scale(.6) translateY(6px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)' },
      ],
      { duration: reduce ? 1 : 220, delay: reduce ? 0 : 200, easing: 'ease-out', fill: 'both' },
    );
    let down: Animation | undefined;
    const t = setTimeout(() => {
      bubble.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
      down = head.current?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(80%)' }], {
        duration: reduce ? 1 : 260,
        easing: 'ease-in',
        fill: 'forwards',
      });
      if (down) down.onfinish = () => done.current();
      else done.current();
    }, 1700);
    return () => {
      clearTimeout(t);
      up?.cancel();
      down?.cancel();
    };
  }, []);

  // Close early if the page scrolls (the fixed position would drift).
  useEffect(() => {
    const close = () => done.current();
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, []);

  return createPortal(
    <div aria-live="polite" className="pointer-events-none">
      {/* bottom edge sits exactly on the card's top edge: the head appears to come out from behind it */}
      <div className="fixed z-[45] overflow-hidden" style={{ left: x, top: y - HEAD, width: HEAD, height: HEAD }}>
        <div ref={head} style={{ transform: 'translateY(80%)' }}>
          <Face kind={kind} color={color} mood={mood} />
        </div>
      </div>
      <div
        ref={bubble}
        className="fixed z-[46] whitespace-nowrap rounded-[10px] border border-ink bg-surface px-2 py-1 text-xs font-semibold text-ink shadow-card"
        style={{ right: Math.max(8, window.innerWidth - x - 4), top: y - HEAD + 2, opacity: 0, transformOrigin: 'right bottom' }}
      >
        {text}
      </div>
    </div>,
    document.body,
  );
}
