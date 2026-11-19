import type { Board, Card, IncomingInvite, LabelId, List, TemplateId, User } from '../types';
import { isoDay } from '../lib/dates';
import { uid } from '../lib/id';
import { COVERS } from '../lib/labels';

export const ME = 'me';

export const TEAMMATES: User[] = [
  { id: 'u-sara', name: 'Sara Riaz', email: 'sara@example.edu', color: '#A8574A' },
  { id: 'u-hamza', name: 'Hamza Malik', email: 'hamza@example.edu', color: '#5E7D57' },
  { id: 'u-ayesha', name: 'Ayesha Khan', email: 'ayesha@example.edu', color: '#4F6C86' },
  { id: 'u-omar', name: 'Omar Siddiqui', email: 'omar@example.edu', color: '#7D6688' },
];

const now = () => new Date().toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

type CardSeed = {
  title: string;
  labels?: LabelId[];
  assignees?: string[];
  due?: number | null; // days from today
  description?: string;
  comments?: { userId: string; text: string; mins: number }[];
};

function buildBoard(
  title: string,
  cover: string,
  lists: { title: string; isDone?: boolean; cards: CardSeed[] }[],
  members: Board['members'],
): Board {
  const board: Board = {
    id: uid('b-'),
    title,
    cover,
    starred: false,
    listOrder: [],
    lists: {},
    cards: {},
    members,
    invites: [],
    inviteLink: null,
    activity: [],
    updatedAt: now(),
  };
  for (const l of lists) {
    const list: List = { id: uid('l-'), title: l.title, cardIds: [], isDone: l.isDone };
    for (const c of l.cards) {
      const card: Card = {
        id: uid('c-'),
        title: c.title,
        description: c.description ?? '',
        labels: c.labels ?? [],
        assignees: c.assignees ?? [],
        due: c.due === undefined || c.due === null ? null : isoDay(c.due),
        comments: (c.comments ?? []).map((cm) => ({ id: uid('m-'), userId: cm.userId, text: cm.text, createdAt: minsAgo(cm.mins) })),
        createdAt: now(),
      };
      board.cards[card.id] = card;
      list.cardIds.push(card.id);
    }
    board.lists[list.id] = list;
    board.listOrder.push(list.id);
  }
  return board;
}

export function seedBoards(): Board[] {
  const cs = buildBoard(
    'CS-301 Final Project',
    COVERS[0],
    [
      {
        title: 'To do',
        cards: [
          { title: 'Draft the literature review', labels: ['research'], assignees: ['u-ayesha'], due: 1, description: 'At least 8 sources. Use the shared Zotero folder.' },
          { title: 'Book lab room for demo day', assignees: ['u-hamza'], due: 9 },
          { title: 'Navbar overlaps content on mobile', labels: ['bug', 'urgent'], assignees: [ME], due: -2 },
          { title: 'Set up CI for the repo', labels: ['backend'], due: 5 },
        ],
      },
      {
        title: 'Doing',
        cards: [
          {
            title: 'Wireframes for login and signup',
            labels: ['design'],
            assignees: ['u-sara'],
            due: 2,
            comments: [
              { userId: 'u-sara', text: 'First pass is in Figma, page 2.', mins: 180 },
              { userId: 'u-hamza', text: 'Looks good. Can we add "Forgot password"?', mins: 95 },
            ],
          },
          { title: 'REST endpoints for boards and lists', labels: ['backend'], assignees: [ME, 'u-hamza'], due: 3 },
        ],
      },
      {
        title: 'Review',
        cards: [{ title: 'Database schema (ER diagram)', labels: ['docs', 'backend'], assignees: ['u-hamza'], due: 0 }],
      },
      {
        title: 'Done',
        isDone: true,
        cards: [
          { title: 'Write the project proposal', labels: ['docs'], assignees: ['u-ayesha', ME], due: -7 },
          { title: 'Pick the tech stack', assignees: [ME] },
        ],
      },
    ],
    [
      { userId: ME, role: 'owner' },
      { userId: 'u-sara', role: 'admin' },
      { userId: 'u-hamza', role: 'member' },
      { userId: 'u-ayesha', role: 'member' },
    ],
  );
  cs.starred = true;
  cs.invites = [{ id: uid('i-'), email: 'dr.farooq@example.edu', role: 'viewer', createdAt: minsAgo(60 * 26) }];
  cs.activity = [
    { id: uid('a-'), userId: 'u-hamza', text: 'commented on “Wireframes for login and signup”', createdAt: minsAgo(95) },
    { id: uid('a-'), userId: 'u-sara', text: 'moved “Wireframes for login and signup” from To do to Doing', createdAt: minsAgo(200) },
    { id: uid('a-'), userId: 'u-ayesha', text: 'moved “Write the project proposal” from Review to Done', createdAt: minsAgo(60 * 20) },
    { id: uid('a-'), userId: ME, text: 'created this board', createdAt: minsAgo(60 * 24 * 6) },
  ];

  const club = buildBoard(
    'Robotics Club: Spring Fair',
    COVERS[2],
    [
      { title: 'Ideas', cards: [{ title: 'Line-following robot race', labels: ['misc'] }, { title: 'Sponsor booth layout', labels: ['design'], due: 12 }] },
      { title: 'Planned', cards: [{ title: 'Order Arduino kits (x12)', labels: ['urgent'], assignees: ['u-omar'], due: 4 }] },
      { title: 'Done', isDone: true, cards: [{ title: 'Reserve the main hall', assignees: [ME] }] },
    ],
    [
      { userId: 'u-omar', role: 'owner' },
      { userId: ME, role: 'member' },
    ],
  );
  club.activity = [{ id: uid('a-'), userId: 'u-omar', text: 'created this board', createdAt: minsAgo(60 * 48) }];

  return [cs, club];
}

export function seedIncomingInvites(): IncomingInvite[] {
  const board = buildBoard(
    'CivicHack 2026',
    COVERS[3],
    [
      { title: 'Backlog', cards: [{ title: 'Pick a problem statement', labels: ['research'], due: 2 }, { title: 'Pitch deck outline', labels: ['slides'] }] },
      { title: 'In progress', cards: [] },
      { title: 'Done', isDone: true, cards: [] },
    ],
    [{ userId: 'u-omar', role: 'owner' }],
  );
  return [{ id: uid('ii-'), fromUserId: 'u-omar', role: 'member', board }];
}

export function boardFromTemplate(title: string, template: TemplateId, cover: string): Board {
  const lists: Record<TemplateId, { title: string; isDone?: boolean; cards: CardSeed[] }[]> = {
    blank: [
      { title: 'To do', cards: [] },
      { title: 'Doing', cards: [] },
      { title: 'Done', isDone: true, cards: [] },
    ],
    class: [
      { title: 'To do', cards: [{ title: 'Read the assignment brief together', labels: ['docs'] }, { title: 'Split the work and assign owners' }] },
      { title: 'Doing', cards: [] },
      { title: 'Review', cards: [] },
      { title: 'Done', isDone: true, cards: [] },
    ],
    hackathon: [
      { title: 'Ideas', cards: [{ title: 'Brainstorm 3 problem statements', labels: ['research'] }] },
      { title: 'Building', cards: [] },
      { title: 'Demo prep', cards: [{ title: 'Record a 2-minute demo video', labels: ['slides'] }] },
      { title: 'Done', isDone: true, cards: [] },
    ],
  };
  const b = buildBoard(title, cover, lists[template], [{ userId: ME, role: 'owner' }]);
  b.activity = [{ id: uid('a-'), userId: ME, text: 'created this board', createdAt: now() }];
  return b;
}
