import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Clock, Plus, Star } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AppHeader } from '../components/AppHeader';
import { AvatarStack, Avatar } from '../components/ui/Avatar';
import { RoleBadge } from '../components/ui/Chips';
import { Dialog } from '../components/ui/Dialog';
import { useStore } from '../store/useStore';
import { ago } from '../lib/dates';
import { firstName } from '../lib/id';
import type { Board, TemplateId } from '../types';

export default function Workspace() {
  const boards = useStore((s) => s.boards);
  const order = useStore((s) => s.boardOrder);
  const incoming = useStore((s) => s.incoming);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.me);
  const me = useStore((s) => s.users[s.me]);
  const accept = useStore((s) => s.acceptInvite);
  const decline = useStore((s) => s.declineInvite);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const list = order.map((id) => boards[id]).filter(Boolean);
  const starred = list.filter((b) => b.starred);

  const myDue = useMemo(() => {
    const out: { board: Board; cardId: string; title: string; due: string; days: number }[] = [];
    for (const b of list) {
      const doneIds = new Set(b.listOrder.filter((l) => b.lists[l].isDone).flatMap((l) => b.lists[l].cardIds));
      for (const lid of b.listOrder)
        for (const cid of b.lists[lid].cardIds) {
          const c = b.cards[cid];
          if (c.due && c.assignees.includes(meId) && !doneIds.has(cid)) {
            const days = differenceInCalendarDays(parseISO(c.due), new Date());
            if (days <= 7) out.push({ board: b, cardId: cid, title: c.title, due: c.due, days });
          }
        }
    }
    return out.sort((a, b) => a.days - b.days);
  }, [list, meId]);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hi {firstName(me?.name ?? '')}, here's what's on</h1>
          </div>
          <button className="btn-cta" onClick={() => setCreating(true)}>
            <Plus size={17} /> New board
          </button>
        </div>

        {incoming.length > 0 && (
          <section className="flex flex-col gap-3" aria-label="Pending invitations">
            {incoming.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-modal border border-line bg-accent-soft/70 p-4">
                <Avatar userId={inv.fromUserId} size="md" />
                <p className="min-w-0 flex-1">
                  <b>{users[inv.fromUserId]?.name}</b> invited you to <b>{inv.boardTitle}</b> as {inv.role}.
                  {me?.emailVerified === false && (
                    <span className="mt-0.5 block text-sm text-muted">Confirm your email first (see the yellow banner at the top), then accept.</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={() => decline(inv.id)}>
                    Decline
                  </button>
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      const id = await accept(inv.id);
                      if (id) navigate(`/b/${id}`);
                    }}
                  >
                    Accept and open
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Clock size={18} className="text-muted" /> Your cards due this week
          </h2>
          {myDue.length === 0 ? (
            <p className="rounded-modal border border-dashed border-line p-5 text-muted">Nothing assigned to you is due in the next 7 days.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-modal border border-line bg-surface">
              {myDue.map((d) => (
                <li key={d.cardId}>
                  <Link to={`/b/${d.board.id}/c/${d.cardId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-column">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.board.cover }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                    <span className="hidden truncate text-sm text-muted sm:block">{d.board.title}</span>
                    <span
                      className={clsx(
                        'shrink-0 rounded-md px-2 py-0.5 font-mono text-xs',
                        d.days < 0 ? 'bg-over text-over-fg' : d.days <= 1 ? 'bg-soon text-soon-fg' : 'bg-column text-muted',
                      )}
                    >
                      {d.days < 0 ? `${-d.days}d late` : d.days === 0 ? 'Today' : d.days === 1 ? 'Tomorrow' : `in ${d.days}d`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {starred.length > 0 && <BoardGrid title="Starred" boards={starred} />}
        <BoardGrid title="All boards" boards={list} onNew={() => setCreating(true)} />
      </main>
      <NewBoardDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function BoardGrid({ title, boards, onNew }: { title: string; boards: Board[]; onNew?: () => void }) {
  const toggleStar = useStore((s) => s.toggleStar);
  const me = useStore((s) => s.me);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {boards.length === 0 && !onNew ? null : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            const cards = b.listOrder.reduce((n, l) => n + b.lists[l].cardIds.length, 0);
            const done = b.listOrder.filter((l) => b.lists[l].isDone).reduce((n, l) => n + b.lists[l].cardIds.length, 0);
            const role = b.members.find((m) => m.userId === me)?.role ?? 'member';
            return (
              <div key={b.id} className="group relative flex flex-col overflow-hidden rounded-modal border border-line bg-surface hover:border-ink">
                <div className="h-16" style={{ background: b.cover }}>
                  <div className="flex h-full items-end gap-1.5 px-4 pb-0 opacity-40">
                    {[60, 35, 48].map((h, i) => (
                      <span key={i} className="w-6 rounded-t-md bg-white" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <Link to={`/b/${b.id}`} className="flex flex-1 flex-col gap-3 p-4 after:absolute after:inset-0">
                  <span className="pr-8 font-display text-lg font-bold leading-tight">{b.title}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-column" aria-label={`${done} of ${cards} cards done`}>
                    <div className="h-full rounded-full bg-success" style={{ width: cards ? `${(done / cards) * 100}%` : 0 }} />
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
                    <AvatarStack ids={b.members.map((m) => m.userId)} />
                    <span className="flex items-center gap-2">
                      <RoleBadge role={role} />
                      <span className="font-mono">{done}/{cards} done</span>
                    </span>
                  </div>
                  <span className="text-xs text-muted">Updated {ago(b.updatedAt)}</span>
                </Link>
                <button
                  onClick={() => toggleStar(b.id)}
                  className={clsx('absolute right-3 top-[76px] z-10 grid h-8 w-8 place-items-center rounded-lg hover:bg-column', b.starred ? 'text-warning' : 'text-muted opacity-0 focus:opacity-100 group-hover:opacity-100')}
                  aria-label={b.starred ? `Unstar ${b.title}` : `Star ${b.title}`}
                  aria-pressed={b.starred}
                >
                  <Star size={17} fill={b.starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
          {onNew && (
            <button onClick={onNew} className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-modal border-2 border-dashed border-line text-muted hover:border-ink hover:text-ink">
              <Plus size={22} />
              <span className="font-semibold">Create a board</span>
              {boards.length === 0 && <span className="text-xs">Start blank or from a template</span>}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const TEMPLATES: { id: TemplateId; name: string; lists: string }[] = [
  { id: 'class', name: 'Class project', lists: 'To do · Doing · Review · Done' },
  { id: 'hackathon', name: 'Hackathon', lists: 'Ideas · Building · Demo prep · Done' },
  { id: 'blank', name: 'Blank', lists: 'To do · Doing · Done' },
];

function NewBoardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createBoard = useStore((s) => s.createBoard);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<TemplateId>('class');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Give the board a name, like “CS-301 Final Project”.');
    setBusy(true);
    const id = await createBoard(title.trim(), template);
    setBusy(false);
    if (!id) return;
    toast('Board created');
    setTitle('');
    setError('');
    onClose();
    navigate(`/b/${id}`);
  };

  return (
    <Dialog open={open} onClose={onClose} title="New board">
      <form onSubmit={submit} className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="board-title" className="text-sm font-semibold">
            Board name
          </label>
          <input id="board-title" data-autofocus className="input" placeholder="CS-301 Final Project" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold">Start from</legend>
          {TEMPLATES.map((t) => (
            <label key={t.id} className={clsx('flex cursor-pointer items-center gap-3 rounded-[10px] border p-3', template === t.id ? 'border-ink bg-column' : 'border-line hover:bg-column')}>
              <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} className="accent-[#2A2926]" />
              <span className="flex flex-col">
                <span className="font-semibold">{t.name}</span>
                <span className="font-mono text-xs text-muted">{t.lists}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-cta" disabled={busy}>{busy ? 'Creating…' : 'Create board'}</button>
        </div>
      </form>
    </Dialog>
  );
}
