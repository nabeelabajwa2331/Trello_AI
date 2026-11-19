import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Archive, ArrowRightLeft, Calendar, Check, CreditCard, MessageSquare, Tag, Trash2, Users, X } from 'lucide-react';
import type { Board, LabelId, Role } from '../../types';
import { useStore, findListOf } from '../../store/useStore';
import { can } from '../../lib/permissions';
import { LABELS, LABEL_IDS } from '../../lib/labels';
import { Avatar } from '../ui/Avatar';
import { DueChip, LabelChip } from '../ui/Chips';
import { Dialog } from '../ui/Dialog';
import { Popover } from '../ui/Popover';
import { ago } from '../../lib/dates';
import { firstName } from '../../lib/id';

export function CardModal({ board, cardId, role, onClose }: { board: Board; cardId: string; role: Role | undefined; onClose: () => void }) {
  const card = board.cards[cardId];
  const listId = findListOf(board, cardId);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const update = useStore((s) => s.updateCard);
  const move = useStore((s) => s.moveCard);
  const archive = useStore((s) => s.archiveCard);
  const restore = useStore((s) => s.restoreCard);
  const notify = useStore((s) => s.notify);
  const edit = can(role, 'editCards');

  const [title, setTitle] = useState(card?.title ?? '');
  const [desc, setDesc] = useState(card?.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  useEffect(() => setTitle(card?.title ?? ''), [card?.title]);
  useEffect(() => { if (!editingDesc) setDesc(card?.description ?? ''); }, [card?.description, editingDesc]);

  if (!card) {
    return (
      <Dialog open onClose={onClose} title="Card not found">
        <p className="p-5 text-muted">This card was deleted or archived by someone else.</p>
      </Dialog>
    );
  }

  const list = listId ? board.lists[listId] : undefined;
  const done = !!list?.isDone;
  const members = board.members.filter((m) => m.role !== 'viewer');

  const saveTitle = () => {
    const v = title.trim();
    if (!v) return setTitle(card.title);
    if (v !== card.title) update(board.id, card.id, { title: v }, `renamed a card to “${v}”`);
  };
  const toggleLabel = (l: LabelId) =>
    update(board.id, card.id, { labels: card.labels.includes(l) ? card.labels.filter((x) => x !== l) : [...card.labels, l] });
  const toggleMember = (uid: string) => {
    const on = card.assignees.includes(uid);
    update(
      board.id,
      card.id,
      { assignees: on ? card.assignees.filter((x) => x !== uid) : [...card.assignees, uid] },
      on ? `removed ${users[uid]?.name} from “${card.title}”` : `assigned ${users[uid]?.name} to “${card.title}”`,
    );
  };

  return (
    <Dialog open onClose={onClose} title={card.title} width="max-w-3xl" hideTitle>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <CreditCard size={20} className="mt-1.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          {edit ? (
            <textarea
              id="card-title"
              value={title}
              rows={1}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              className="w-full resize-none rounded-md bg-transparent px-1 font-display text-xl font-bold focus:bg-bg focus:outline-none"
              aria-label="Card title"
              data-autofocus
            />
          ) : (
            <h2 className="px-1 text-xl font-bold">{card.title}</h2>
          )}
          <p className="px-1 text-sm text-muted">
            in list <b className="text-ink">{list?.title ?? 'Archived'}</b>
            {card.archived && <span className="ml-2 rounded bg-soon px-1.5 py-0.5 text-xs font-semibold text-soon-fg">Archived</span>}
          </p>
        </div>
        <button data-close className="btn-quiet h-9 w-9 p-0" onClick={onClose} aria-label="Close card">
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex min-w-0 flex-col gap-6">
          {(card.assignees.length > 0 || card.labels.length > 0 || card.due) && (
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {card.assignees.length > 0 && (
                <Meta label="Members">
                  <div className="flex flex-wrap gap-1">{card.assignees.map((a) => <Avatar key={a} userId={a} size="md" />)}</div>
                </Meta>
              )}
              {card.labels.length > 0 && (
                <Meta label="Labels">
                  <div className="flex flex-wrap gap-1">{card.labels.map((l) => <LabelChip key={l} id={l} className="!py-1 !text-[11px]" />)}</div>
                </Meta>
              )}
              {card.due && (
                <Meta label="Due">
                  <DueChip due={card.due} done={done} className="!px-2 !py-1 !text-xs" />
                </Meta>
              )}
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold">Description</h3>
            {editingDesc ? (
              <div className="flex flex-col gap-2">
                <textarea id="card-desc" autoFocus rows={5} className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Add details, links, or what “done” means for this task…" />
                <div className="flex gap-2">
                  <button className="btn-primary px-3 py-1.5" onClick={() => { update(board.id, card.id, { description: desc.trim() }); setEditingDesc(false); toast('Saved'); }}>Save</button>
                  <button className="btn-quiet" onClick={() => { setDesc(card.description); setEditingDesc(false); }}>Cancel</button>
                </div>
              </div>
            ) : card.description ? (
              <p className={clsx('whitespace-pre-wrap rounded-md px-1 text-[14px]', edit && 'cursor-text hover:bg-column')} onClick={() => edit && setEditingDesc(true)}>{card.description}</p>
            ) : edit ? (
              <button className="rounded-md bg-column px-3 py-3 text-left text-sm text-muted hover:bg-line/60" onClick={() => setEditingDesc(true)}>Add a more detailed description…</button>
            ) : (
              <p className="text-sm text-muted">No description.</p>
            )}
          </section>

          <Comments board={board} cardId={card.id} canComment={can(role, 'comment')} />
        </div>

        {edit && (
          <aside className="flex flex-col gap-1.5">
            <span className="eyebrow mb-1">Add to card</span>
            <Popover className="w-64" trigger={({ toggle }) => <SideButton icon={Users} onClick={toggle}>Members</SideButton>}>
              {() => (
                <div className="flex flex-col">
                  <span className="px-2.5 py-1.5 text-xs font-semibold text-muted">Board members</span>
                  {members.map((m) => (
                    <button key={m.userId} onClick={() => toggleMember(m.userId)} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-column">
                      <Avatar userId={m.userId} />
                      <span className="flex-1 truncate">{users[m.userId]?.name}{m.userId === me && ' (you)'}</span>
                      {card.assignees.includes(m.userId) && <Check size={15} className="text-success" />}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Popover className="w-56" trigger={({ toggle }) => <SideButton icon={Tag} onClick={toggle}>Labels</SideButton>}>
              {() => (
                <div className="flex flex-col gap-1 p-1">
                  {LABEL_IDS.map((l) => (
                    <button key={l} onClick={() => toggleLabel(l)} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-column" aria-pressed={card.labels.includes(l)}>
                      <span className={clsx('flex-1 rounded px-2 py-1.5 text-left text-xs font-semibold', LABELS[l].className)}>{LABELS[l].name}</span>
                      <span className="w-4">{card.labels.includes(l) && <Check size={15} />}</span>
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Popover className="w-64" trigger={({ toggle }) => <SideButton icon={Calendar} onClick={toggle}>Due date</SideButton>}>
              {(close) => (
                <div className="flex flex-col gap-2 p-2">
                  <label htmlFor="due-input" className="text-xs font-semibold text-muted">Due date</label>
                  <input
                    id="due-input"
                    type="date"
                    className="input"
                    value={card.due ?? ''}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      update(board.id, card.id, { due: v }, v ? `set “${card.title}” due ${v}` : `removed the due date from “${card.title}”`);
                    }}
                  />
                  {card.due && (
                    <button className="btn-quiet justify-start text-danger" onClick={() => { update(board.id, card.id, { due: null }); close(); }}>
                      Remove due date
                    </button>
                  )}
                </div>
              )}
            </Popover>

            <span className="eyebrow mb-1 mt-4">Actions</span>
            {!card.archived && (
              <Popover className="w-56" trigger={({ toggle }) => <SideButton icon={ArrowRightLeft} onClick={toggle}>Move</SideButton>}>
                {(close) => (
                  <div className="flex flex-col">
                    {board.listOrder.map((lid) => (
                      <button
                        key={lid}
                        disabled={lid === listId}
                        onClick={() => { move(board.id, card.id, lid); close(); toast(`Moved to ${board.lists[lid].title}`); }}
                        className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-column disabled:opacity-50"
                      >
                        {board.lists[lid].title}
                        {lid === listId && <span className="text-xs text-muted">current</span>}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}
            {card.archived ? (
              <SideButton icon={Archive} onClick={() => { restore(board.id, card.id); toast('Card restored'); }}>Restore</SideButton>
            ) : (
              <SideButton
                icon={Archive}
                onClick={() => {
                  archive(board.id, card.id);
                  onClose();
                  toast(`Archived “${card.title}”`, { action: { label: 'Undo', onClick: () => restore(board.id, card.id) }, duration: 6000 });
                }}
              >
                Archive
              </SideButton>
            )}
            {/* Demo helper: shows how an assignment notification looks */}
            <button
              className="mt-3 text-left text-[11px] text-muted underline-offset-2 hover:underline"
              onClick={() => {
                const mate = board.members.find((m) => m.userId !== me)?.userId;
                if (mate) notify({ text: `assigned you to “${card.title}”`, actorId: mate, boardId: board.id, cardId: card.id });
                toast('Sample notification added to the bell');
              }}
            >
              Preview a notification
            </button>
          </aside>
        )}
      </div>
    </Dialog>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-text">{label}</span>
      {children}
    </div>
  );
}

function SideButton({ icon: Icon, children, onClick }: { icon: typeof Users; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md bg-column px-3 py-2 text-left text-sm font-medium hover:bg-line/70">
      <Icon size={15} className="text-muted" /> {children}
    </button>
  );
}

/* ---------------- Comments with @mentions ---------------- */
function Comments({ board, cardId, canComment }: { board: Board; cardId: string; canComment: boolean }) {
  const card = board.cards[cardId];
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const addComment = useStore((s) => s.addComment);
  const editComment = useStore((s) => s.editComment);
  const deleteComment = useStore((s) => s.deleteComment);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const query = /(?:^|\s)@(\w*)$/.exec(text)?.[1];
  const suggestions = useMemo(() => {
    if (query === undefined) return [];
    return board.members
      .map((m) => users[m.userId])
      .filter((u) => u && u.id !== me && u.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);
  }, [query, board.members, users, me]);

  const pick = (name: string) => {
    setText((t) => t.replace(/@(\w*)$/, `@${firstName(name)} `));
    setMentionIdx(0);
    ref.current?.focus();
  };
  const post = () => {
    const v = text.trim();
    if (!v) return;
    addComment(board.id, cardId, v);
    setText('');
  };

  const comments = [...card.comments].reverse();

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <MessageSquare size={15} className="text-muted" /> Comments
        <span className="font-mono text-xs font-normal text-muted">{card.comments.length}</span>
      </h3>
      {canComment && (
        <div className="relative flex gap-2.5">
          <Avatar userId={me} size="md" />
          <div className="flex flex-1 flex-col gap-2">
            <textarea
              ref={ref}
              id="comment-input"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (suggestions.length) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % suggestions.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[mentionIdx].name); return; }
                }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); }
              }}
              placeholder="Write a comment… type @ to mention someone"
              className="input resize-y"
            />
            {suggestions.length > 0 && (
              <ul role="listbox" className="absolute left-12 top-[70px] z-10 w-60 rounded-[10px] border border-line bg-surface p-1 shadow-pop">
                {suggestions.map((u, i) => (
                  <li key={u.id}>
                    <button role="option" aria-selected={i === mentionIdx} onMouseDown={(e) => { e.preventDefault(); pick(u.name); }} className={clsx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm', i === mentionIdx ? 'bg-column' : 'hover:bg-column')}>
                      <Avatar userId={u.id} /> {u.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-3">
              <button className="btn-primary px-3 py-1.5" onClick={post} disabled={!text.trim()}>Comment</button>
              <span className="text-[11px] text-muted">Ctrl + Enter to post</span>
            </div>
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar userId={c.userId} size="md" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <b>{users[c.userId]?.name ?? 'Former member'}</b>{' '}
                <span className="text-xs text-muted">{ago(c.createdAt)}{c.edited && ' (edited)'}</span>
              </div>
              {editing === c.id ? (
                <div className="mt-1 flex flex-col gap-2">
                  <textarea className="input" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                  <div className="flex gap-2">
                    <button className="btn-primary px-3 py-1.5" onClick={() => { if (editText.trim()) editComment(board.id, cardId, c.id, editText.trim()); setEditing(null); }}>Save</button>
                    <button className="btn-quiet" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-column px-3 py-2 text-sm">
                  <Mentions text={c.text} />
                </p>
              )}
              {c.userId === me && editing !== c.id && (
                <div className="mt-1 flex gap-3 text-xs text-muted">
                  <button className="hover:text-ink hover:underline" onClick={() => { setEditing(c.id); setEditText(c.text); }}>Edit</button>
                  <button className="inline-flex items-center gap-1 hover:text-danger hover:underline" onClick={() => deleteComment(board.id, cardId, c.id)}><Trash2 size={11} /> Delete</button>
                </div>
              )}
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-muted">No comments yet.</li>}
      </ul>
    </section>
  );
}

function Mentions({ text }: { text: string }) {
  const parts = text.split(/(@\w+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="rounded bg-accent-soft px-1 font-semibold">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
