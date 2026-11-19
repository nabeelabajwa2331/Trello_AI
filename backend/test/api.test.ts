/**
 * API tests: run with `npm test`. Uses its own SQLite file (prisma/test.db), reset before every run.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret';

let server: Server;
let base = '';

type Res = { status: number; body: any };
class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown): Promise<Res> {
    const r = await fetch(base + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  patch = (p: string, b: unknown) => this.req('PATCH', p, b);
  put = (p: string, b: unknown) => this.req('PUT', p, b);
  del = (p: string) => this.req('DELETE', p);
}

async function signup(name: string, email: string) {
  const c = new Client();
  const r = await c.post('/auth/signup', { name, email, password: 'password123' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { c, id: r.body.user.id as string };
}

before(async () => {
  execSync('npx prisma db push --force-reset --skip-generate', { cwd: new URL('..', import.meta.url), env: process.env, stdio: 'ignore' });
  const { createAppServer } = await import('../src/app.js');
  server = createAppServer();
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  const { prisma } = await import('../src/db.js');
  await prisma.$disconnect();
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

describe('auth', () => {
  test('signup, me, logout', async () => {
    const { c } = await signup('Test Person', 'test@example.edu');
    assert.equal((await c.get('/auth/me')).body.user.email, 'test@example.edu');
    await c.post('/auth/logout');
    c.cookie = '';
    assert.equal((await c.get('/auth/me')).status, 401);
  });

  test('rejects a duplicate email, a wrong password and a short password', async () => {
    const c = new Client();
    assert.equal((await c.post('/auth/signup', { name: 'Again', email: 'test@example.edu', password: 'password123' })).status, 409);
    assert.equal((await c.post('/auth/login', { email: 'test@example.edu', password: 'nope-nope' })).status, 401);
    const short = await c.post('/auth/signup', { name: 'Shorty', email: 'short@example.edu', password: '123' });
    assert.equal(short.status, 400);
    assert.match(short.body.error, /8 characters/);
  });

  test('API needs a session', async () => {
    assert.equal((await new Client().get('/bootstrap')).status, 401);
  });
});

describe('boards, lists and cards', () => {
  let owner: Awaited<ReturnType<typeof signup>>;
  let boardId = '';
  let lists: string[] = [];

  before(async () => {
    owner = await signup('Owner One', 'owner@example.edu');
    const r = await owner.c.post('/boards', { title: 'CS-301', template: 'class' });
    assert.equal(r.status, 201);
    boardId = r.body.board.id;
    lists = r.body.board.listOrder;
  });

  test('a new board uses the template and makes the creator owner', async () => {
    const { body } = await owner.c.get(`/boards/${boardId}`);
    assert.deepEqual(lists.map((l) => body.board.lists[l].title), ['To do', 'Doing', 'Review', 'Done']);
    assert.equal(body.board.lists[lists[3]].isDone, true);
    assert.deepEqual(body.board.members, [{ userId: owner.id, role: 'owner' }]);
    assert.equal(body.board.activity[0].text, 'created this board');
  });

  test('cards keep their order when moved (fractional positions)', async () => {
    const add = async (t: string) => (await owner.c.post(`/lists/${lists[1]}/cards`, { title: t })).body.cardId as string;
    const a = await add('A'), b = await add('B'), c = await add('C');
    // Move C between A and B, then A to the end.
    await owner.c.post(`/cards/${c}/move`, { toListId: lists[1], index: 1 });
    const r = await owner.c.post(`/cards/${a}/move`, { toListId: lists[1], index: 2 });
    assert.deepEqual(r.body.board.lists[lists[1]].cardIds, [c, b, a]);
  });

  test('moving across lists is logged', async () => {
    const id = (await owner.c.post(`/lists/${lists[0]}/cards`, { title: 'Write report' })).body.cardId;
    const r = await owner.c.post(`/cards/${id}/move`, { toListId: lists[3], index: 0 });
    assert.equal(r.body.board.lists[lists[3]].cardIds[0], id);
    assert.equal(r.body.board.activity[0].text, 'moved “Write report” from To do to Done');
  });

  test('editing a card validates its fields', async () => {
    const id = (await owner.c.post(`/lists/${lists[0]}/cards`, { title: 'Slides' })).body.cardId;
    const ok = await owner.c.patch(`/cards/${id}`, { labels: ['slides', 'urgent'], due: '2026-12-01', description: 'Ten slides max' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.board.cards[id].labels, ['slides', 'urgent']);
    assert.equal((await owner.c.patch(`/cards/${id}`, { labels: ['not-a-label'] })).status, 400);
    assert.equal((await owner.c.patch(`/cards/${id}`, { due: '01/12/2026' })).status, 400);
  });

  test('archive hides a card from its list and restore brings it back', async () => {
    const id = (await owner.c.post(`/lists/${lists[0]}/cards`, { title: 'Temp' })).body.cardId;
    const arch = await owner.c.post(`/cards/${id}/archive`);
    assert.equal(arch.body.board.lists[lists[0]].cardIds.includes(id), false);
    assert.equal(arch.body.board.cards[id].archived, true);
    const back = await owner.c.post(`/cards/${id}/restore`);
    assert.equal(back.body.board.lists[lists[0]].cardIds.includes(id), true);
  });

  test("a list with cards can't be deleted", async () => {
    assert.equal((await owner.c.del(`/lists/${lists[0]}`)).status, 409);
    const empty = (await owner.c.post(`/boards/${boardId}/lists`, { title: 'Spare' })).body.board.listOrder.at(-1);
    assert.equal((await owner.c.del(`/lists/${empty}`)).status, 200);
  });

  test('list reorder must include every list', async () => {
    assert.equal((await owner.c.put(`/boards/${boardId}/list-order`, { order: lists.slice(1) })).status, 409);
    const r = await owner.c.put(`/boards/${boardId}/list-order`, { order: [...lists].reverse() });
    assert.deepEqual(r.body.board.listOrder, [...lists].reverse());
  });
});

describe('roles and invitations', () => {
  let owner: Awaited<ReturnType<typeof signup>>;
  let viewer: Awaited<ReturnType<typeof signup>>;
  let member: Awaited<ReturnType<typeof signup>>;
  let outsider: Awaited<ReturnType<typeof signup>>;
  let boardId = '';
  let todo = '';

  before(async () => {
    owner = await signup('Owen Owner', 'owen@example.edu');
    const r = await owner.c.post('/boards', { title: 'Group Report', template: 'blank' });
    boardId = r.body.board.id;
    todo = r.body.board.listOrder[0];

    // Viewer: invited by email before they have an account, accepts after signing up.
    await owner.c.post(`/boards/${boardId}/invites`, { email: 'vera@example.edu', role: 'viewer' });
    viewer = await signup('Vera Viewer', 'vera@example.edu');
    const boot = await viewer.c.get('/bootstrap');
    assert.equal(boot.body.incoming.length, 1);
    assert.equal((await viewer.c.post(`/invites/${boot.body.incoming[0].id}/accept`)).status, 200);

    // Member: joins with an invite link.
    const link = (await owner.c.post(`/boards/${boardId}/invite-link`, { role: 'member' })).body.board.inviteLink;
    member = await signup('Mina Member', 'mina@example.edu');
    assert.equal((await member.c.post(`/join/${link.token}`)).status, 200);

    outsider = await signup('Otto Outsider', 'otto@example.edu');
  });

  test('members list shows each role', async () => {
    const { body } = await owner.c.get(`/boards/${boardId}`);
    const roles = Object.fromEntries(body.board.members.map((m: { userId: string; role: string }) => [m.userId, m.role]));
    assert.deepEqual(roles, { [owner.id]: 'owner', [viewer.id]: 'viewer', [member.id]: 'member' });
  });

  test('a viewer can look but not change anything', async () => {
    assert.equal((await viewer.c.get(`/boards/${boardId}`)).status, 200);
    const r = await viewer.c.post(`/lists/${todo}/cards`, { title: 'Sneaky' });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /Viewers/);
  });

  test('a member can edit cards but not invite or change roles', async () => {
    assert.equal((await member.c.post(`/lists/${todo}/cards`, { title: 'Real work' })).status, 201);
    assert.equal((await member.c.post(`/boards/${boardId}/invites`, { email: 'x@example.edu', role: 'member' })).status, 403);
    assert.equal((await member.c.patch(`/boards/${boardId}/members/${viewer.id}`, { role: 'admin' })).status, 403);
  });

  test("only the owner can delete the board, and the owner can't be demoted", async () => {
    await owner.c.patch(`/boards/${boardId}/members/${member.id}`, { role: 'admin' });
    assert.equal((await member.c.del(`/boards/${boardId}`)).status, 403);
    assert.equal((await member.c.patch(`/boards/${boardId}/members/${owner.id}`, { role: 'member' })).status, 403);
  });

  test("people who aren't on the board get 404, not the board", async () => {
    const r = await outsider.c.get(`/boards/${boardId}`);
    assert.equal(r.status, 404);
    assert.equal(r.body.board, undefined);
  });

  test("you can only edit your own comments", async () => {
    const card = (await owner.c.post(`/lists/${todo}/cards`, { title: 'Discuss' })).body.cardId;
    const r = await owner.c.post(`/cards/${card}/comments`, { text: 'First!' });
    const commentId = r.body.board.cards[card].comments[0].id;
    assert.equal((await member.c.patch(`/comments/${commentId}`, { text: 'hijacked' })).status, 403);
    assert.equal((await owner.c.patch(`/comments/${commentId}`, { text: 'First, edited' })).status, 200);
  });

  test('assigning someone and @mentioning them sends notifications', async () => {
    const card = (await owner.c.post(`/lists/${todo}/cards`, { title: 'Survey' })).body.cardId;
    await owner.c.patch(`/cards/${card}`, { assignees: [member.id, viewer.id] }); // viewers can't be assigned
    await owner.c.post(`/cards/${card}/comments`, { text: '@Mina please start this' });
    const { body } = await member.c.get('/bootstrap');
    const texts = body.notifications.map((n: { text: string }) => n.text);
    assert.ok(texts.includes('assigned you to “Survey”'));
    assert.ok(texts.includes('mentioned you on “Survey”'));
    const snap = await owner.c.get(`/boards/${boardId}`);
    assert.deepEqual(snap.body.board.cards[card].assignees, [member.id]);
  });

  test('a removed member loses access', async () => {
    await owner.c.del(`/boards/${boardId}/members/${viewer.id}`);
    assert.equal((await viewer.c.get(`/boards/${boardId}`)).status, 404);
  });

  test('a turned-off invite link stops working', async () => {
    const snap = await owner.c.post(`/boards/${boardId}/invite-link`, { role: 'viewer' });
    const token = snap.body.board.inviteLink.token;
    await owner.c.post(`/boards/${boardId}/invite-link`, { role: 'member' }); // replaces the old link
    assert.equal((await outsider.c.post(`/join/${token}`)).status, 410);
  });
});
