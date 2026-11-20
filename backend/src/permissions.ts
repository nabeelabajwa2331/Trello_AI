import { prisma } from './db.js';
import { forbidden, notFound } from './http.js';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Action = 'view' | 'comment' | 'editCards' | 'editLists' | 'invite' | 'manageMembers' | 'editBoard' | 'deleteBoard';

/** Same matrix as frontend/src/lib/permissions.ts. The server is the one that actually enforces it. */
const matrix: Record<Action, Role[]> = {
  view: ['owner', 'admin', 'member', 'viewer'],
  comment: ['owner', 'admin', 'member'],
  editCards: ['owner', 'admin', 'member'],
  editLists: ['owner', 'admin', 'member'],
  invite: ['owner', 'admin'],
  manageMembers: ['owner', 'admin'],
  editBoard: ['owner', 'admin'],
  deleteBoard: ['owner'],
};

export const can = (role: string | undefined, action: Action) => !!role && matrix[action].includes(role as Role);

/** Throws 404 if the user isn't on the board (don't reveal it exists), 403 if their role can't do this. */
export async function requireRole(boardId: string, userId: string, action: Action): Promise<Role> {
  const m = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
  if (!m) throw notFound('This board');
  if (!can(m.role, action)) throw forbidden(m.role === 'viewer' ? 'Viewers can look but not change anything.' : undefined);
  return m.role as Role;
}
