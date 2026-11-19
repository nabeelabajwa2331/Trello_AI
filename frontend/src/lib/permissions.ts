import type { Board, Role } from '../types';

export type Action =
  | 'view'
  | 'comment'
  | 'editCards'
  | 'editLists'
  | 'invite'
  | 'manageMembers'
  | 'editBoard'
  | 'deleteBoard';

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

export function can(role: Role | undefined, action: Action): boolean {
  return !!role && matrix[action].includes(role);
}

export function roleOf(board: Board | undefined, userId: string): Role | undefined {
  return board?.members.find((m) => m.userId === userId)?.role;
}

export const roleInfo: Record<Role, { label: string; hint: string }> = {
  owner: { label: 'Owner', hint: 'Full control, including deleting the board' },
  admin: { label: 'Admin', hint: 'Can invite people and change roles' },
  member: { label: 'Member', hint: 'Can create, edit and move cards' },
  viewer: { label: 'Viewer', hint: 'Can only look. Good for a teacher or mentor' },
};
