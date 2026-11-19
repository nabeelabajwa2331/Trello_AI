export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type LabelId = 'research' | 'design' | 'bug' | 'docs' | 'urgent' | 'backend' | 'slides' | 'misc';

export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
  /** Google profile photo, when they signed in with Google */
  avatarUrl?: string | null;
  /** They clicked the confirmation email (or used Google / a reset link) */
  emailVerified?: boolean;
  /** Site admin (only ever set on your own user) */
  isAdmin?: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  edited?: boolean;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  labels: LabelId[];
  assignees: string[];
  due: string | null; // yyyy-MM-dd
  comments: Comment[];
  createdAt: string;
  archived?: boolean;
  archivedFrom?: string; // list id, used by Undo
}

export interface List {
  id: string;
  title: string;
  cardIds: string[];
  isDone?: boolean; // cards here count as completed
}

export interface Member {
  userId: string;
  role: Role;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Activity {
  id: string;
  userId: string;
  text: string;
  cardId?: string;
  createdAt: string;
}

export interface Board {
  id: string;
  title: string;
  cover: string;
  starred: boolean;
  listOrder: string[];
  lists: Record<string, List>;
  cards: Record<string, Card>;
  members: Member[];
  invites: Invite[];
  inviteLink: { role: Role; token: string; expiresAt: string } | null;
  activity: Activity[];
  updatedAt: string;
}

export interface Notification {
  id: string;
  text: string;
  actorId: string;
  boardId: string;
  cardId?: string;
  read: boolean;
  createdAt: string;
}

/** An invitation sent to the current user for a board they are not on yet. */
export interface IncomingInvite {
  id: string;
  fromUserId: string;
  role: Role;
  boardTitle: string;
  boardCover: string;
}

export type TemplateId = 'blank' | 'class' | 'hackathon';
