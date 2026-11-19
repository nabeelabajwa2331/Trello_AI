import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import type { Board, Card, IncomingInvite, Notification, Role, TemplateId, User } from '../types';
import { api, ApiError, errorMessage } from '../lib/api';
import { connectRealtime, disconnectRealtime } from '../lib/realtime';
import { firstName, uid } from '../lib/id';

type Snap = { board: Board; users: Record<string, User> };
type Bootstrap = { me: User; users: Record<string, User>; boards: Board[]; incoming: IncomingInvite[]; notifications: Notification[] };

interface State {
  status: 'loading' | 'guest' | 'ready';
  me: string;
  users: Record<string, User>;
  boards: Record<string, Board>;
  boardOrder: string[];
  incoming: IncomingInvite[];
  notifications: Notification[];
  presence: Record<string, string[]>;
  online: boolean;
  /** Card that briefly highlights after a teammate changes it. */
  flash: { cardId: string; at: number } | null;

  // session
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  applySnapshot: (snap: Snap, keepStar?: boolean) => void;
  refreshBoard: (boardId: string) => Promise<void>;

  // boards
  createBoard: (title: string, template: TemplateId) => Promise<string | null>;
  renameBoard: (boardId: string, title: string) => void;
  toggleStar: (boardId: string) => void;
  deleteBoard: (boardId: string) => Promise<boolean>;

  // lists
  addList: (boardId: string, title: string) => void;
  renameList: (boardId: string, listId: string, title: string) => void;
  deleteList: (boardId: string, listId: string) => void;
  reorderLists: (boardId: string, order: string[]) => void;

  // cards
  addCard: (boardId: string, listId: string, title: string) => void;
  updateCard: (boardId: string, cardId: string, patch: Partial<Pick<Card, 'title' | 'description' | 'labels' | 'assignees' | 'due'>>, _log?: string) => void;
  applyLayout: (boardId: string, layout: Record<string, string[]>, cardId: string, fromListId: string) => void;
  moveCard: (boardId: string, cardId: string, toListId: string) => void;
  archiveCard: (boardId: string, cardId: string) => void;
  restoreCard: (boardId: string, cardId: string) => void;
  addComment: (boardId: string, cardId: string, text: string) => void;
  editComment: (boardId: string, cardId: string, commentId: string, text: string) => void;
  deleteComment: (boardId: string, cardId: string, commentId: string) => void;

  // members
  invite: (boardId: string, email: string, role: Role) => Promise<boolean>;
  revokeInvite: (boardId: string, inviteId: string) => void;
  createInviteLink: (boardId: string, role: Role) => void;
  setRole: (boardId: string, userId: string, role: Role) => void;
  removeMember: (boardId: string, userId: string) => void;
  acceptInvite: (id: string) => Promise<string | null>;
  declineInvite: (id: string) => void;
  joinByToken: (token: string) => Promise<string>;

  // notifications
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const findListOf = (board: Board, cardId: string) => board.listOrder.find((id) => board.lists[id]?.cardIds.includes(cardId));

const onBoardPage = (boardId: string) => location.pathname.startsWith(`/b/${boardId}`);

export const useStore = create<State>()(
  immer((set, get) => {
    /**
     * Optimistic update: change the screen now, send the request, then take the server's board as the truth.
     * If the request fails, show why and reload the board, which rolls the change back.
     */
    const run = async (boardId: string, optimistic: ((b: Board) => void) | null, request: () => Promise<Snap>): Promise<Snap | null> => {
      if (optimistic) set((s) => void (s.boards[boardId] && optimistic(s.boards[boardId])));
      try {
        const snap = await request();
        get().applySnapshot(snap);
        return snap;
      } catch (e) {
        toast.error(errorMessage(e));
        await get().refreshBoard(boardId);
        return null;
      }
    };

    const startRealtime = () =>
      connectRealtime({
        onSync: ({ board, users, log }) => {
          if (!get().boards[board.id]) return;
          get().applySnapshot({ board, users }, true);
          if (log && log.actorId !== get().me) {
            if (log.cardId) set((s) => void (s.flash = { cardId: log.cardId!, at: Date.now() }));
            if (onBoardPage(board.id)) toast(`${firstName(get().users[log.actorId]?.name ?? 'Someone')} ${log.text}`);
          }
        },
        onNotification: (n) => {
          if ('type' in n) {
            set((s) => void s.incoming.unshift(n.invite as IncomingInvite));
            toast(`${firstName(get().users[n.invite.fromUserId]?.name ?? 'Someone')} invited you to “${n.invite.boardTitle}”`);
            return;
          }
          set((s) => void s.notifications.unshift(n));
          if (!get().users[n.actorId]) void get().bootstrap();
          toast(`${firstName(get().users[n.actorId]?.name ?? 'Someone')} ${n.text}`);
        },
        onRemoved: (boardId) => {
          const title = get().boards[boardId]?.title;
          set((s) => {
            delete s.boards[boardId];
            s.boardOrder = s.boardOrder.filter((id) => id !== boardId);
          });
          if (title) toast(`You no longer have access to “${title}”.`);
        },
        onPresence: (boardId, ids) => set((s) => void (s.presence[boardId] = ids)),
        onStatus: (online) => set((s) => void (s.online = online)),
        onReconnect: () => void get().bootstrap(),
      });

    return {
      status: 'loading',
      me: '',
      users: {},
      boards: {},
      boardOrder: [],
      incoming: [],
      notifications: [],
      presence: {},
      online: true,
      flash: null,

      /* ---------------- session ---------------- */
      init: async () => {
        try {
          await get().bootstrap();
          startRealtime();
        } catch {
          set((s) => void (s.status = 'guest'));
        }
      },
      login: async (email, password) => {
        await api('/auth/login', 'POST', { email, password });
        await get().bootstrap();
        startRealtime();
      },
      signup: async (name, email, password) => {
        await api('/auth/signup', 'POST', { name, email, password });
        await get().bootstrap();
        startRealtime();
      },
      logout: async () => {
        disconnectRealtime();
        await api('/auth/logout', 'POST').catch(() => {});
        set((s) => Object.assign(s, { status: 'guest', me: '', users: {}, boards: {}, boardOrder: [], incoming: [], notifications: [], presence: {} }));
      },
      bootstrap: async () => {
        const d = await api<Bootstrap>('/bootstrap');
        set((s) => {
          s.status = 'ready';
          s.me = d.me.id;
          s.users = d.users;
          s.boards = Object.fromEntries(d.boards.map((b) => [b.id, b]));
          s.boardOrder = d.boards.map((b) => b.id);
          s.incoming = d.incoming;
          s.notifications = d.notifications;
        });
      },
      applySnapshot: ({ board, users }, keepStar) =>
        set((s) => {
          const prev = s.boards[board.id];
          s.boards[board.id] = keepStar && prev ? { ...board, starred: prev.starred } : board;
          Object.assign(s.users, users);
          if (!s.boardOrder.includes(board.id)) s.boardOrder.unshift(board.id);
        }),
      refreshBoard: async (boardId) => {
        try {
          get().applySnapshot(await api<Snap>(`/boards/${boardId}`));
        } catch (e) {
          if (e instanceof ApiError && e.status === 404)
            set((s) => {
              delete s.boards[boardId];
              s.boardOrder = s.boardOrder.filter((id) => id !== boardId);
            });
        }
      },

      /* ---------------- boards ---------------- */
      createBoard: async (title, template) => {
        try {
          const snap = await api<Snap>('/boards', 'POST', { title, template });
          get().applySnapshot(snap);
          return snap.board.id;
        } catch (e) {
          toast.error(errorMessage(e));
          return null;
        }
      },
      renameBoard: (boardId, title) => void run(boardId, (b) => void (b.title = title), () => api(`/boards/${boardId}`, 'PATCH', { title })),
      toggleStar: (boardId) => {
        const starred = !get().boards[boardId]?.starred;
        set((s) => void (s.boards[boardId] && (s.boards[boardId].starred = starred)));
        api(`/boards/${boardId}/star`, 'POST', { starred }).catch((e) => {
          toast.error(errorMessage(e));
          set((s) => void (s.boards[boardId] && (s.boards[boardId].starred = !starred)));
        });
      },
      deleteBoard: async (boardId) => {
        try {
          await api(`/boards/${boardId}`, 'DELETE');
          set((s) => {
            delete s.boards[boardId];
            s.boardOrder = s.boardOrder.filter((id) => id !== boardId);
          });
          return true;
        } catch (e) {
          toast.error(errorMessage(e));
          return false;
        }
      },

      /* ---------------- lists ---------------- */
      addList: (boardId, title) =>
        void run(
          boardId,
          (b) => {
            const id = uid('tmp-');
            b.lists[id] = { id, title, cardIds: [] };
            b.listOrder.push(id);
          },
          () => api(`/boards/${boardId}/lists`, 'POST', { title }),
        ),
      renameList: (boardId, listId, title) => void run(boardId, (b) => void (b.lists[listId].title = title), () => api(`/lists/${listId}`, 'PATCH', { title })),
      deleteList: (boardId, listId) =>
        void run(
          boardId,
          (b) => {
            delete b.lists[listId];
            b.listOrder = b.listOrder.filter((id) => id !== listId);
          },
          () => api(`/lists/${listId}`, 'DELETE'),
        ),
      reorderLists: (boardId, order) => void run(boardId, (b) => void (b.listOrder = order), () => api(`/boards/${boardId}/list-order`, 'PUT', { order })),

      /* ---------------- cards ---------------- */
      addCard: (boardId, listId, title) =>
        void run(
          boardId,
          (b) => {
            const id = uid('tmp-');
            b.cards[id] = { id, title, description: '', labels: [], assignees: [], due: null, comments: [], createdAt: new Date().toISOString() };
            b.lists[listId].cardIds.push(id);
          },
          () => api(`/lists/${listId}/cards`, 'POST', { title }),
        ),
      updateCard: (boardId, cardId, patch) =>
        void run(boardId, (b) => void (b.cards[cardId] && Object.assign(b.cards[cardId], patch)), () => api(`/cards/${cardId}`, 'PATCH', patch)),
      applyLayout: (boardId, layout, cardId, fromListId) => {
        const b = get().boards[boardId];
        if (!b) return;
        const toListId = Object.keys(layout).find((id) => layout[id].includes(cardId));
        if (!toListId) return;
        const index = layout[toListId].indexOf(cardId);
        if (toListId === fromListId && b.lists[fromListId].cardIds.indexOf(cardId) === index) return; // dropped where it started
        void run(
          boardId,
          (d) => {
            for (const [lid, ids] of Object.entries(layout)) if (d.lists[lid]) d.lists[lid].cardIds = ids;
          },
          () => api(`/cards/${cardId}/move`, 'POST', { toListId, index }),
        );
      },
      moveCard: (boardId, cardId, toListId) => {
        const b = get().boards[boardId];
        const from = b && findListOf(b, cardId);
        if (!b || !from || from === toListId) return;
        const index = b.lists[toListId].cardIds.length;
        void run(
          boardId,
          (d) => {
            d.lists[from].cardIds = d.lists[from].cardIds.filter((id) => id !== cardId);
            d.lists[toListId].cardIds.push(cardId);
          },
          () => api(`/cards/${cardId}/move`, 'POST', { toListId, index }),
        );
      },
      archiveCard: (boardId, cardId) =>
        void run(
          boardId,
          (d) => {
            const from = findListOf(d, cardId);
            if (from) d.lists[from].cardIds = d.lists[from].cardIds.filter((id) => id !== cardId);
            d.cards[cardId].archived = true;
            d.cards[cardId].archivedFrom = from;
          },
          () => api(`/cards/${cardId}/archive`, 'POST'),
        ),
      restoreCard: (boardId, cardId) => void run(boardId, null, () => api(`/cards/${cardId}/restore`, 'POST')),
      addComment: (boardId, cardId, text) =>
        void run(
          boardId,
          (b) => void b.cards[cardId].comments.push({ id: uid('tmp-'), userId: get().me, text, createdAt: new Date().toISOString() }),
          () => api(`/cards/${cardId}/comments`, 'POST', { text }),
        ),
      editComment: (boardId, cardId, commentId, text) =>
        void run(
          boardId,
          (b) => {
            const c = b.cards[cardId].comments.find((x) => x.id === commentId);
            if (c) Object.assign(c, { text, edited: true });
          },
          () => api(`/comments/${commentId}`, 'PATCH', { text }),
        ),
      deleteComment: (boardId, cardId, commentId) =>
        void run(boardId, (b) => void (b.cards[cardId].comments = b.cards[cardId].comments.filter((x) => x.id !== commentId)), () => api(`/comments/${commentId}`, 'DELETE')),

      /* ---------------- members ---------------- */
      invite: async (boardId, email, role) => !!(await run(boardId, null, () => api(`/boards/${boardId}/invites`, 'POST', { email, role }))),
      revokeInvite: (boardId, inviteId) => void run(boardId, (b) => void (b.invites = b.invites.filter((i) => i.id !== inviteId)), () => api(`/invites/${inviteId}`, 'DELETE')),
      createInviteLink: (boardId, role) => void run(boardId, null, () => api(`/boards/${boardId}/invite-link`, 'POST', { role })),
      setRole: (boardId, userId, role) =>
        void run(
          boardId,
          (b) => {
            const m = b.members.find((x) => x.userId === userId);
            if (m) m.role = role;
          },
          () => api(`/boards/${boardId}/members/${userId}`, 'PATCH', { role }),
        ),
      removeMember: (boardId, userId) =>
        void run(boardId, (b) => void (b.members = b.members.filter((m) => m.userId !== userId)), () => api(`/boards/${boardId}/members/${userId}`, 'DELETE')),
      acceptInvite: async (id) => {
        try {
          const snap = await api<Snap>(`/invites/${id}/accept`, 'POST');
          get().applySnapshot(snap);
          set((s) => void (s.incoming = s.incoming.filter((i) => i.id !== id)));
          return snap.board.id;
        } catch (e) {
          toast.error(errorMessage(e));
          return null;
        }
      },
      declineInvite: (id) => {
        set((s) => void (s.incoming = s.incoming.filter((i) => i.id !== id)));
        api(`/invites/${id}/decline`, 'POST').catch((e) => toast.error(errorMessage(e)));
      },
      joinByToken: async (token) => {
        const snap = await api<Snap>(`/join/${token}`, 'POST');
        get().applySnapshot(snap);
        return snap.board.id;
      },

      /* ---------------- notifications ---------------- */
      markRead: (id) => {
        set((s) => void s.notifications.forEach((n) => n.id === id && (n.read = true)));
        api(`/notifications/${id}/read`, 'POST').catch(() => {});
      },
      markAllRead: () => {
        set((s) => void s.notifications.forEach((n) => (n.read = true)));
        api('/notifications/read-all', 'POST').catch(() => {});
      },
    };
  }),
);

/** Current user's role on a board. */
export const useMyRole = (boardId: string | undefined) =>
  useStore((s) => (boardId ? s.boards[boardId]?.members.find((m) => m.userId === s.me)?.role : undefined));
