import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Board, Card, IncomingInvite, Notification, Role, TemplateId, User } from '../types';
import { ME, TEAMMATES, boardFromTemplate, seedBoards, seedIncomingInvites } from '../data/seed';
import { publish } from '../lib/realtime';
import { firstName, uid } from '../lib/id';
import { COVERS } from '../lib/labels';
import { isoDay } from '../lib/dates';

type Log = { text: string; actorId?: string; cardId?: string };

interface State {
  me: string;
  session: boolean;
  users: Record<string, User>;
  boards: Record<string, Board>;
  boardOrder: string[];
  incoming: IncomingInvite[];
  notifications: Notification[];
  simulateTeammates: boolean;
  /** Card that should briefly highlight after a remote change. Not persisted. */
  flash: { cardId: string; at: number } | null;

  // session
  login: (name: string, email: string) => void;
  logout: () => void;
  resetDemo: () => void;

  // boards
  createBoard: (title: string, template: TemplateId) => string;
  renameBoard: (boardId: string, title: string) => void;
  toggleStar: (boardId: string) => void;
  deleteBoard: (boardId: string) => void;

  // lists
  addList: (boardId: string, title: string) => void;
  renameList: (boardId: string, listId: string, title: string) => void;
  deleteList: (boardId: string, listId: string) => void;
  reorderLists: (boardId: string, order: string[]) => void;

  // cards
  addCard: (boardId: string, listId: string, title: string) => void;
  updateCard: (boardId: string, cardId: string, patch: Partial<Card>, logText?: string) => void;
  applyLayout: (boardId: string, layout: Record<string, string[]>, cardId: string, fromListId: string) => void;
  moveCard: (boardId: string, cardId: string, toListId: string, actorId?: string) => void;
  archiveCard: (boardId: string, cardId: string) => void;
  restoreCard: (boardId: string, cardId: string) => void;
  addComment: (boardId: string, cardId: string, text: string, actorId?: string) => void;
  editComment: (boardId: string, cardId: string, commentId: string, text: string) => void;
  deleteComment: (boardId: string, cardId: string, commentId: string) => void;

  // members
  invite: (boardId: string, email: string, role: Role) => void;
  revokeInvite: (boardId: string, inviteId: string) => void;
  createInviteLink: (boardId: string, role: Role) => void;
  setRole: (boardId: string, userId: string, role: Role) => void;
  removeMember: (boardId: string, userId: string) => void;
  acceptInvite: (id: string) => string | null;
  declineInvite: (id: string) => void;

  // notifications
  notify: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;

  // realtime
  applyRemote: (board: Board, log: { text: string; actorId: string; cardId?: string } | null) => void;
  setSimulate: (on: boolean) => void;
}

export const findListOf = (board: Board, cardId: string) =>
  board.listOrder.find((id) => board.lists[id]?.cardIds.includes(cardId));

const freshData = () => {
  const boards = seedBoards();
  return {
    users: Object.fromEntries([...TEAMMATES, { id: ME, name: 'You', email: '', color: '#2A2926' }].map((u) => [u.id, u])),
    boards: Object.fromEntries(boards.map((b) => [b.id, b])),
    boardOrder: boards.map((b) => b.id),
    incoming: seedIncomingInvites(),
    notifications: [] as Notification[],
  };
};

export const useStore = create<State>()(
  persist(
    immer((set, get) => {
      /** Mutate one board, add an activity entry, then broadcast the new board to teammates. */
      const commit = (boardId: string, recipe: (b: Board) => void, log?: Log) => {
        set((s) => {
          const b = s.boards[boardId];
          if (!b) return;
          recipe(b);
          if (log) {
            b.activity.unshift({ id: uid('a-'), userId: log.actorId ?? s.me, text: log.text, cardId: log.cardId, createdAt: new Date().toISOString() });
            b.activity = b.activity.slice(0, 200);
          }
          b.updatedAt = new Date().toISOString();
        });
        const board = get().boards[boardId];
        if (board) publish({ type: 'board:sync', board, log: log ? { text: log.text, actorId: log.actorId ?? ME, cardId: log.cardId } : null });
      };

      const cardTitle = (boardId: string, cardId: string) => get().boards[boardId]?.cards[cardId]?.title ?? 'a card';
      const listTitle = (boardId: string, listId: string) => get().boards[boardId]?.lists[listId]?.title ?? 'a list';

      return {
        me: ME,
        session: false,
        ...freshData(),
        simulateTeammates: true,
        flash: null,

        login: (name, email) =>
          set((s) => {
            s.session = true;
            s.users[ME] = { ...s.users[ME], name: name.trim() || 'You', email };
          }),
        logout: () => set((s) => void (s.session = false)),
        resetDemo: () => set((s) => Object.assign(s, freshData())),

        createBoard: (title, template) => {
          const cover = COVERS[get().boardOrder.length % COVERS.length];
          const b = boardFromTemplate(title.trim(), template, cover);
          set((s) => {
            s.boards[b.id] = b;
            s.boardOrder.unshift(b.id);
          });
          return b.id;
        },
        renameBoard: (boardId, title) => commit(boardId, (b) => void (b.title = title), { text: `renamed the board to “${title}”` }),
        toggleStar: (boardId) => set((s) => void (s.boards[boardId] && (s.boards[boardId].starred = !s.boards[boardId].starred))),
        deleteBoard: (boardId) =>
          set((s) => {
            delete s.boards[boardId];
            s.boardOrder = s.boardOrder.filter((id) => id !== boardId);
            s.notifications = s.notifications.filter((n) => n.boardId !== boardId);
          }),

        addList: (boardId, title) =>
          commit(
            boardId,
            (b) => {
              const id = uid('l-');
              b.lists[id] = { id, title, cardIds: [] };
              b.listOrder.push(id);
            },
            { text: `added the list “${title}”` },
          ),
        renameList: (boardId, listId, title) => {
          const old = listTitle(boardId, listId);
          commit(boardId, (b) => void (b.lists[listId].title = title), { text: `renamed the list “${old}” to “${title}”` });
        },
        deleteList: (boardId, listId) => {
          const old = listTitle(boardId, listId);
          commit(
            boardId,
            (b) => {
              delete b.lists[listId];
              b.listOrder = b.listOrder.filter((id) => id !== listId);
            },
            { text: `deleted the list “${old}”` },
          );
        },
        reorderLists: (boardId, order) => commit(boardId, (b) => void (b.listOrder = order), { text: 'reordered the lists' }),

        addCard: (boardId, listId, title) => {
          const id = uid('c-');
          commit(
            boardId,
            (b) => {
              b.cards[id] = { id, title, description: '', labels: [], assignees: [], due: null, comments: [], createdAt: new Date().toISOString() };
              b.lists[listId].cardIds.push(id);
            },
            { text: `added “${title}” to ${listTitle(boardId, listId)}`, cardId: id },
          );
        },
        updateCard: (boardId, cardId, patch, logText) =>
          commit(boardId, (b) => void Object.assign(b.cards[cardId], patch), logText ? { text: logText, cardId } : undefined),

        applyLayout: (boardId, layout, cardId, fromListId) => {
          const toListId = Object.keys(layout).find((id) => layout[id].includes(cardId));
          const moved = toListId && toListId !== fromListId;
          commit(
            boardId,
            (b) => {
              for (const [listId, ids] of Object.entries(layout)) if (b.lists[listId]) b.lists[listId].cardIds = ids;
            },
            moved
              ? { text: `moved “${cardTitle(boardId, cardId)}” from ${listTitle(boardId, fromListId)} to ${listTitle(boardId, toListId!)}`, cardId }
              : undefined,
          );
        },
        moveCard: (boardId, cardId, toListId, actorId) => {
          const b = get().boards[boardId];
          if (!b) return;
          const from = findListOf(b, cardId);
          if (!from || from === toListId) return;
          commit(
            boardId,
            (d) => {
              d.lists[from].cardIds = d.lists[from].cardIds.filter((id) => id !== cardId);
              d.lists[toListId].cardIds.push(cardId);
            },
            { text: `moved “${cardTitle(boardId, cardId)}” from ${listTitle(boardId, from)} to ${listTitle(boardId, toListId)}`, cardId, actorId },
          );
          if (actorId && actorId !== ME) set((s) => void (s.flash = { cardId, at: Date.now() }));
        },
        archiveCard: (boardId, cardId) => {
          const b = get().boards[boardId];
          const from = b && findListOf(b, cardId);
          if (!from) return;
          commit(
            boardId,
            (d) => {
              d.lists[from].cardIds = d.lists[from].cardIds.filter((id) => id !== cardId);
              d.cards[cardId].archived = true;
              d.cards[cardId].archivedFrom = from;
            },
            { text: `archived “${cardTitle(boardId, cardId)}”`, cardId },
          );
        },
        restoreCard: (boardId, cardId) =>
          commit(
            boardId,
            (d) => {
              const c = d.cards[cardId];
              const target = (c.archivedFrom && d.lists[c.archivedFrom]?.id) || d.listOrder[0];
              if (!target) return;
              c.archived = false;
              d.lists[target].cardIds.push(cardId);
            },
            { text: `restored “${cardTitle(boardId, cardId)}”`, cardId },
          ),
        addComment: (boardId, cardId, text, actorId) => {
          const s = get();
          const author = actorId ?? s.me;
          commit(
            boardId,
            (b) => void b.cards[cardId].comments.push({ id: uid('m-'), userId: author, text, createdAt: new Date().toISOString() }),
            { text: `commented on “${cardTitle(boardId, cardId)}”`, cardId, actorId: author },
          );
          // A teammate @mentioning you creates a notification.
          const myFirst = firstName(s.users[s.me].name).toLowerCase();
          if (author !== s.me && new RegExp(`@(${myFirst}|you)\\b`, 'i').test(text)) {
            get().notify({ text: `mentioned you on “${cardTitle(boardId, cardId)}”`, actorId: author, boardId, cardId });
          }
        },
        editComment: (boardId, cardId, commentId, text) =>
          commit(boardId, (b) => {
            const c = b.cards[cardId].comments.find((x) => x.id === commentId);
            if (c) Object.assign(c, { text, edited: true });
          }),
        deleteComment: (boardId, cardId, commentId) =>
          commit(boardId, (b) => void (b.cards[cardId].comments = b.cards[cardId].comments.filter((x) => x.id !== commentId))),

        invite: (boardId, email, role) =>
          commit(boardId, (b) => void b.invites.push({ id: uid('i-'), email, role, createdAt: new Date().toISOString() }), {
            text: `invited ${email} as ${role}`,
          }),
        revokeInvite: (boardId, inviteId) => commit(boardId, (b) => void (b.invites = b.invites.filter((i) => i.id !== inviteId))),
        createInviteLink: (boardId, role) => commit(boardId, (b) => void (b.inviteLink = { role, expiresAt: isoDay(7) })),
        setRole: (boardId, userId, role) =>
          commit(
            boardId,
            (b) => {
              const m = b.members.find((x) => x.userId === userId);
              if (m) m.role = role;
            },
            { text: `changed ${get().users[userId]?.name ?? 'a member'}'s role to ${role}` },
          ),
        removeMember: (boardId, userId) =>
          commit(
            boardId,
            (b) => {
              b.members = b.members.filter((m) => m.userId !== userId);
              for (const c of Object.values(b.cards)) c.assignees = c.assignees.filter((a) => a !== userId);
            },
            { text: `removed ${get().users[userId]?.name ?? 'a member'} from the board` },
          ),
        acceptInvite: (id) => {
          const inv = get().incoming.find((i) => i.id === id);
          if (!inv) return null;
          set((s) => {
            const b = structuredClone(inv.board);
            b.members.push({ userId: s.me, role: inv.role });
            b.activity.unshift({ id: uid('a-'), userId: s.me, text: 'joined the board', createdAt: new Date().toISOString() });
            s.boards[b.id] = b;
            s.boardOrder.unshift(b.id);
            s.incoming = s.incoming.filter((i) => i.id !== id);
          });
          return inv.board.id;
        },
        declineInvite: (id) => set((s) => void (s.incoming = s.incoming.filter((i) => i.id !== id))),

        notify: (n) =>
          set((s) => {
            s.notifications.unshift({ ...n, id: uid('n-'), read: false, createdAt: new Date().toISOString() });
            s.notifications = s.notifications.slice(0, 50);
          }),
        markRead: (id) => set((s) => void s.notifications.forEach((n) => n.id === id && (n.read = true))),
        markAllRead: () => set((s) => void s.notifications.forEach((n) => (n.read = true))),

        applyRemote: (board, log) =>
          set((s) => {
            if (!s.boards[board.id]) return;
            s.boards[board.id] = board;
            if (log?.cardId) s.flash = { cardId: log.cardId, at: Date.now() };
          }),
        setSimulate: (on) => set((s) => void (s.simulateTeammates = on)),
      };
    }),
    {
      name: 'crewboard-v2',
      partialize: ({ flash: _flash, ...rest }) => rest,
    },
  ),
);

/** Current user's role on a board. */
export const useMyRole = (boardId: string | undefined) =>
  useStore((s) => (boardId ? s.boards[boardId]?.members.find((m) => m.userId === s.me)?.role : undefined));
