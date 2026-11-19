/**
 * Demo data. Every account uses the password "password123".
 *   demo@crewboard.app   (you, owner of CS-301)
 *   sara@example.edu     (admin on CS-301)  ← log in as her in a second browser to watch live updates
 *   hamza@example.edu, ayesha@example.edu, omar@example.edu
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

async function main() {
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);
  const mk = (name: string, email: string, color: string) => prisma.user.create({ data: { name, email, color, passwordHash } });
  const me = await mk('Demo Student', 'demo@crewboard.app', '#2A2926');
  const sara = await mk('Sara Riaz', 'sara@example.edu', '#A8574A');
  const hamza = await mk('Hamza Malik', 'hamza@example.edu', '#5E7D57');
  const ayesha = await mk('Ayesha Khan', 'ayesha@example.edu', '#4F6C86');
  const omar = await mk('Omar Siddiqui', 'omar@example.edu', '#7D6688');

  type C = { title: string; labels?: string[]; who?: string[]; due?: number; desc?: string; comments?: [string, string, number][] };
  async function board(title: string, cover: string, members: [string, string][], lists: { title: string; isDone?: boolean; cards: C[] }[]) {
    const b = await prisma.board.create({ data: { title, cover, members: { create: members.map(([userId, role]) => ({ userId, role })) } } });
    for (const [i, l] of lists.entries()) {
      const list = await prisma.list.create({ data: { boardId: b.id, title: l.title, position: (i + 1) * 1024, isDone: !!l.isDone } });
      for (const [k, c] of l.cards.entries()) {
        await prisma.card.create({
          data: {
            boardId: b.id, listId: list.id, title: c.title, description: c.desc ?? '', position: (k + 1) * 1024,
            labels: JSON.stringify(c.labels ?? []), due: c.due === undefined ? null : day(c.due),
            assignees: { create: (c.who ?? []).map((userId) => ({ userId })) },
            comments: { create: (c.comments ?? []).map(([userId, text, mins]) => ({ userId, text, createdAt: ago(mins) })) },
          },
        });
      }
    }
    return b;
  }

  const cs = await board('CS-301 Final Project', '#2A2926', [[me.id, 'owner'], [sara.id, 'admin'], [hamza.id, 'member'], [ayesha.id, 'member']], [
    { title: 'To do', cards: [
      { title: 'Draft the literature review', labels: ['research'], who: [ayesha.id], due: 1, desc: 'At least 8 sources. Use the shared Zotero folder.' },
      { title: 'Book lab room for demo day', who: [hamza.id], due: 9 },
      { title: 'Navbar overlaps content on mobile', labels: ['bug', 'urgent'], who: [me.id], due: -2 },
      { title: 'Set up CI for the repo', labels: ['backend'], due: 5 },
    ] },
    { title: 'Doing', cards: [
      { title: 'Wireframes for login and signup', labels: ['design'], who: [sara.id], due: 2, comments: [[sara.id, 'First pass is in Figma, page 2.', 180], [hamza.id, 'Looks good. Can we add "Forgot password"?', 95]] },
      { title: 'REST endpoints for boards and lists', labels: ['backend'], who: [me.id, hamza.id], due: 3 },
    ] },
    { title: 'Review', cards: [{ title: 'Database schema (ER diagram)', labels: ['docs', 'backend'], who: [hamza.id], due: 0 }] },
    { title: 'Done', isDone: true, cards: [
      { title: 'Write the project proposal', labels: ['docs'], who: [ayesha.id, me.id], due: -7 },
      { title: 'Pick the tech stack', who: [me.id] },
    ] },
  ]);
  await prisma.boardMember.update({ where: { boardId_userId: { boardId: cs.id, userId: me.id } }, data: { starred: true } });
  await prisma.invite.create({ data: { boardId: cs.id, email: 'dr.farooq@example.edu', role: 'viewer', invitedById: me.id, createdAt: ago(60 * 26) } });
  await prisma.activity.createMany({ data: [
    { boardId: cs.id, userId: me.id, text: 'created this board', createdAt: ago(60 * 24 * 6) },
    { boardId: cs.id, userId: ayesha.id, text: 'moved “Write the project proposal” from Review to Done', createdAt: ago(60 * 20) },
    { boardId: cs.id, userId: sara.id, text: 'moved “Wireframes for login and signup” from To do to Doing', createdAt: ago(200) },
    { boardId: cs.id, userId: hamza.id, text: 'commented on “Wireframes for login and signup”', createdAt: ago(95) },
  ] });

  const club = await board('Robotics Club: Spring Fair', '#5E7D57', [[omar.id, 'owner'], [me.id, 'member']], [
    { title: 'Ideas', cards: [{ title: 'Line-following robot race', labels: ['misc'] }, { title: 'Sponsor booth layout', labels: ['design'], due: 12 }] },
    { title: 'Planned', cards: [{ title: 'Order Arduino kits (x12)', labels: ['urgent'], who: [omar.id], due: 4 }] },
    { title: 'Done', isDone: true, cards: [{ title: 'Reserve the main hall', who: [me.id] }] },
  ]);
  await prisma.activity.create({ data: { boardId: club.id, userId: omar.id, text: 'created this board', createdAt: ago(60 * 48) } });

  const hack = await board('CivicHack 2026', '#A8574A', [[omar.id, 'owner']], [
    { title: 'Backlog', cards: [{ title: 'Pick a problem statement', labels: ['research'], due: 2 }, { title: 'Pitch deck outline', labels: ['slides'] }] },
    { title: 'In progress', cards: [] },
    { title: 'Done', isDone: true, cards: [] },
  ]);
  await prisma.invite.create({ data: { boardId: hack.id, email: me.email, role: 'member', invitedById: omar.id } });

  console.log('Seeded. Log in as demo@crewboard.app / password123 (or sara@example.edu in another browser).');
}

main().finally(() => prisma.$disconnect());
