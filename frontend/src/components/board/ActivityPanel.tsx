import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import {
  Archive,
  ArrowRightLeft,
  CalendarClock,
  Columns3,
  History,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Activity, Board } from '../../types';
import { useStore } from '../../store/useStore';
import { Avatar } from '../ui/Avatar';
import { ago } from '../../lib/dates';

/* ------------------------------------------------------------------ what kind of change is it? */

type Kind = 'move' | 'comment' | 'add' | 'assign' | 'unassign' | 'archive' | 'restore' | 'due' | 'rename' | 'list' | 'people' | 'created';
type Filter = 'all' | 'cards' | 'comments' | 'people';

const KINDS: { kind: Kind; test: RegExp; icon: LucideIcon; tone: string; filter: Exclude<Filter, 'all'> }[] = [
  { kind: 'move', test: /^moved “/, icon: ArrowRightLeft, tone: 'bg-accent text-on-accent', filter: 'cards' },
  {
    kind: 'comment',
    test: /^commented on/,
    icon: MessageSquare,
    tone: 'bg-[#DCE3EA] text-[#3D5A75] dark:bg-[#26313B] dark:text-[#A9C1D8]',
    filter: 'comments',
  },
  { kind: 'add', test: /^added “/, icon: Plus, tone: 'bg-done text-done-fg', filter: 'cards' },
  {
    kind: 'assign',
    test: /^assigned /,
    icon: UserPlus,
    tone: 'bg-[#E6DDE8] text-[#6A4C73] dark:bg-[#352B38] dark:text-[#D2B9D9]',
    filter: 'cards',
  },
  // checked before "unassign", because "removed the due date from …" also starts with "removed"
  { kind: 'due', test: /due \d{4}-|due date/, icon: CalendarClock, tone: 'bg-soon text-soon-fg', filter: 'cards' },
  { kind: 'unassign', test: /^removed .+ from “/, icon: UserMinus, tone: 'bg-column text-muted', filter: 'cards' },
  { kind: 'archive', test: /^archived /, icon: Archive, tone: 'bg-over text-over-fg', filter: 'cards' },
  { kind: 'restore', test: /^restored /, icon: RotateCcw, tone: 'bg-done text-done-fg', filter: 'cards' },
  { kind: 'rename', test: /^renamed /, icon: Pencil, tone: 'bg-column text-muted', filter: 'cards' },
  { kind: 'list', test: /the list|reordered the lists/, icon: Columns3, tone: 'bg-column text-muted', filter: 'cards' },
  {
    kind: 'people',
    test: /^(invited|joined|changed .+ role|removed .+ from the board|left the board|revoked|created an invite link|turned off the invite link)/,
    icon: Users,
    tone: 'bg-column text-ink',
    filter: 'people',
  },
  { kind: 'created', test: /^created this board/, icon: Sparkles, tone: 'bg-accent text-on-accent', filter: 'people' },
];

const kindOf = (text: string) =>
  KINDS.find((k) => k.test.test(text)) ?? { kind: 'rename' as Kind, icon: History, tone: 'bg-column text-muted', filter: 'cards' as const };

/* ------------------------------------------------------------------ grouping */

type Entry = { userId: string; items: Activity[] };
type Day = { label: string; entries: Entry[] };

const dayLabel = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEEE, MMM d' : 'MMM d, yyyy');
};

/** Days, newest first. Inside a day, a burst by the same person within 10 minutes becomes one entry. */
function group(activity: Activity[]): Day[] {
  const days: Day[] = [];
  for (const a of activity) {
    const label = dayLabel(a.createdAt);
    let day = days[days.length - 1];
    if (!day || day.label !== label) days.push((day = { label, entries: [] }));
    const last = day.entries[day.entries.length - 1];
    const lastTime = last && new Date(last.items[last.items.length - 1].createdAt).getTime();
    if (last && last.userId === a.userId && lastTime - new Date(a.createdAt).getTime() < 10 * 60_000) last.items.push(a);
    else day.entries.push({ userId: a.userId, items: [a] });
  }
  return days;
}

/* ------------------------------------------------------------------ one line of activity */

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-block rounded bg-column px-1.5 py-px text-[12px] font-medium text-ink">{children}</span>
);

/** Card names (in quotes) become bold links; "from A to B" becomes two list chips. */
function ActivityText({ a, board }: { a: Activity; board: Board }) {
  const card = a.cardId ? board.cards[a.cardId] : undefined;
  const cardLink = (title: string) =>
    card && !card.archived ? (
      <Link
        to={`/b/${board.id}/c/${card.id}`}
        className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-2 hover:decoration-accent"
      >
        {title}
      </Link>
    ) : (
      <span className="font-semibold text-ink">{title}</span>
    );

  const move = /^moved “(.+)” from (.+) to (.+)$/.exec(a.text);
  if (move) {
    return (
      <>
        moved {cardLink(move[1])}{' '}
        <span className="whitespace-nowrap">
          <Chip>{move[2]}</Chip> <span aria-label="to">→</span> <Chip>{move[3]}</Chip>
        </span>
      </>
    );
  }
  const parts = a.text.split(/“([^”]+)”/g);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span key={i}>{cardLink(p)}</span> : <span key={i}>{p}</span>))}</>;
}

/* ------------------------------------------------------------------ panel */

const PAGE = 40;

export function ActivityPanel({ board, onClose }: { board: Board; onClose: () => void }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const [filter, setFilter] = useState<Filter>('all');
  const [mine, setMine] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: board.activity.length, cards: 0, comments: 0, people: 0 };
    for (const a of board.activity) c[kindOf(a.text).filter]++;
    return c;
  }, [board.activity]);

  const filtered = useMemo(
    () => board.activity.filter((a) => (filter === 'all' || kindOf(a.text).filter === filter) && (!mine || a.userId === me)),
    [board.activity, filter, mine, me],
  );
  const days = useMemo(() => group(filtered.slice(0, shown)), [filtered, shown]);

  const tabs: [Filter, string][] = [
    ['all', 'All'],
    ['cards', 'Cards'],
    ['comments', 'Comments'],
    ['people', 'People'],
  ];

  return createPortal(
    <div className="fixed inset-0 z-40 bg-[#1E1D1A]/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="absolute inset-y-0 right-0 flex w-[min(420px,100vw)] flex-col border-l border-ink bg-surface shadow-pop"
        aria-label="Board activity"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <History size={18} className="text-muted" /> Activity
            </h2>
            <p className="truncate text-xs text-muted">
              {board.title} · {board.activity.length} {board.activity.length === 1 ? 'change' : 'changes'}
            </p>
          </div>
          <button className="btn-quiet h-8 w-8 shrink-0 p-0" onClick={onClose} aria-label="Close activity">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-bg px-4 py-2.5">
          <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => {
                  setFilter(key);
                  setShown(PAGE);
                }}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                  filter === key ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-muted hover:border-ink hover:text-ink',
                )}
              >
                {label}
                <span className={clsx('font-mono text-[10px]', filter === key ? 'text-surface/70' : 'text-muted')}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
            <input
              type="checkbox"
              id="activity-mine"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#2A2926]"
            />
            Only me
          </label>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto">
          {days.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-column text-muted">
                <History size={18} />
              </span>
              <p className="font-semibold">{board.activity.length ? 'Nothing matches this filter' : 'No activity yet'}</p>
              <p className="max-w-[30ch] text-sm text-muted">
                {board.activity.length
                  ? 'Try another tab, or turn off “Only me”.'
                  : 'When people add, move or discuss cards, it shows up here.'}
              </p>
            </div>
          ) : (
            days.map((day) => (
              <section key={day.label} aria-label={day.label}>
                <h3 className="sticky top-0 z-10 border-b border-line bg-surface/95 px-5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
                  {day.label}
                </h3>
                <ol className="relative px-5 py-3">
                  {/* the timeline rail */}
                  <span className="absolute bottom-3 left-[35px] top-3 w-px bg-line" aria-hidden="true" />
                  {day.entries.map((e) => {
                    const first = e.items[0];
                    const who = e.userId === me ? 'You' : (users[e.userId]?.name ?? 'Former member');
                    return (
                      <li key={first.id} className="relative flex gap-3 pb-4 last:pb-0">
                        <span className="relative z-[1] rounded-full ring-4 ring-surface">
                          <Avatar userId={e.userId} size="md" />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{who}</span>
                            <time
                              dateTime={first.createdAt}
                              title={format(parseISO(first.createdAt), 'PPpp')}
                              className="shrink-0 font-mono text-[11px] text-muted"
                            >
                              {day.label === 'Today' ? ago(first.createdAt) : format(parseISO(first.createdAt), 'h:mm a')}
                            </time>
                          </div>
                          {e.items.length > 1 && <p className="text-xs text-muted">{e.items.length} changes in a row</p>}
                          <ul className="mt-1.5 flex flex-col gap-1.5">
                            {e.items.map((a) => {
                              const k = kindOf(a.text);
                              const Icon = k.icon;
                              return (
                                <li
                                  key={a.id}
                                  className="flex items-start gap-2 rounded-[8px] border border-line bg-bg px-2.5 py-2 text-[13px] leading-snug text-muted"
                                >
                                  <span
                                    className={clsx('mt-px grid h-5 w-5 shrink-0 place-items-center rounded', k.tone)}
                                    aria-hidden="true"
                                  >
                                    <Icon size={12} strokeWidth={2.4} />
                                  </span>
                                  <span className="min-w-0 break-words">
                                    <ActivityText a={a} board={board} />
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}
          {filtered.length > shown && (
            <div className="px-5 pb-5">
              <button className="btn-ghost w-full" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, filtered.length - shown)} more
              </button>
            </div>
          )}
        </div>

        <p className="border-t border-line px-5 py-2.5 text-[11px] text-muted">
          Keeps the latest {board.activity.length} changes. Click a card name to open it.
        </p>
      </aside>
    </div>,
    document.body,
  );
}
