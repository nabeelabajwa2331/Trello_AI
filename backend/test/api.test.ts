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
process.env.NODE_ENV = 'test'; // turns off rate limits so many signups in a row are fine

let server: Server;
let base = '';

/** Every email the app "sends" during the tests. */
const mail: { to: string; subject: string; text: string }[] = [];
const mailsTo = (to: string, subject: RegExp) => mail.filter((m) => m.to === to && subject.test(m.subject));
const tokenIn = (text: string, path: string) => new RegExp(`${path}\\?token=([\\w-]+)`).exec(text)?.[1] ?? '';

/** Clicks the "confirm your email" link that was mailed to this address. */
async function verify(email: string) {
  const m = mailsTo(email, /Confirm your email/).at(-1);
  assert.ok(m, `a confirmation email was sent to ${email}`);
  const r = await new Client().post('/auth/verify', { token: tokenIn(m.text, 'verify-email') });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

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
  // Re-pick the provider first: generated.prisma may still say postgresql after a push to Neon.
  execSync('node scripts/prisma-provider.mjs && npx prisma db push --force-reset --skip-generate', { cwd: new URL('..', import.meta.url), env: process.env, stdio: 'ignore' });
  const { createAppServer } = await import('../src/app.js');
  const { mailer } = await import('../src/mail.js');
  mailer.send = async (m) => void mail.push({ to: m.to, subject: m.subject, text: m.text });
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

describe('security', () => {
  test("an unconfirmed account can't accept an email invite sent to that address", async () => {
    const owner = await signup('Inviter', 'inviter@example.edu');
    const b = (await owner.c.post('/boards', { title: 'Private', template: 'blank' })).body.board;
    await owner.c.post(`/boards/${b.id}/invites`, { email: 'target@example.edu', role: 'member' });
    const impostor = await signup('Impostor', 'target@example.edu'); // never clicks the email link
    const inv = (await impostor.c.get('/bootstrap')).body.incoming[0];
    const r = await impostor.c.post(`/invites/${inv.id}/accept`);
    assert.equal(r.status, 403);
    assert.match(r.body.error, /Confirm your email/);
    assert.equal((await impostor.c.get(`/boards/${b.id}`)).status, 404);
    // After confirming, the real owner of the inbox can join.
    await verify('target@example.edu');
    assert.equal((await impostor.c.post(`/invites/${inv.id}/accept`)).status, 200);
  });

  test('confirmation links work once, and signup sends one', async () => {
    const { c } = await signup('Carla Confirm', 'carla@example.edu');
    assert.equal((await c.get('/auth/me')).body.user.emailVerified, false);
    const token = tokenIn(mailsTo('carla@example.edu', /Confirm your email/)[0].text, 'verify-email');
    assert.equal((await new Client().post('/auth/verify', { token })).status, 200);
    assert.equal((await c.get('/auth/me')).body.user.emailVerified, true);
    assert.equal((await new Client().post('/auth/verify', { token })).status, 410);
  });

  test('a copied cookie stops working once you log out', async () => {
    const { c } = await signup('Lab Computer', 'lab@example.edu');
    const copy = new Client();
    copy.cookie = c.cookie;
    assert.equal((await copy.get('/auth/me')).status, 200);
    await c.post('/auth/logout');
    assert.equal((await copy.get('/auth/me')).status, 401);
  });

  test('"log out everywhere" and password reset end every other session', async () => {
    const { c: laptop } = await signup('Many Devices', 'devices@example.edu');
    const phone = new Client();
    assert.equal((await phone.post('/auth/login', { email: 'devices@example.edu', password: 'password123' })).status, 200);
    await laptop.post('/auth/logout-all');
    assert.equal((await phone.get('/auth/me')).status, 401);
    assert.equal((await laptop.get('/auth/me')).status, 401);

    const old = new Client();
    await old.post('/auth/login', { email: 'devices@example.edu', password: 'password123' });
    await new Client().post('/auth/forgot', { email: 'devices@example.edu' });
    const token = tokenIn(mailsTo('devices@example.edu', /Reset your/).at(-1)!.text, 'reset-password');
    const fresh = new Client();
    assert.equal((await fresh.post('/auth/reset', { token, password: 'fresh-password-9' })).status, 200);
    assert.equal((await old.get('/auth/me')).status, 401, 'old session ended');
    assert.equal((await fresh.get('/auth/me')).body.user.emailVerified, true, 'reset proves the email');
  });

  test('too many wrong passwords lock that account for a while', async () => {
    await signup('Locked Out', 'locked@example.edu');
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await new Client().post('/auth/login', { email: 'locked@example.edu', password: `wrong-${i}` })).status;
    assert.equal(last, 429);
    const r = await new Client().post('/auth/login', { email: 'locked@example.edu', password: 'password123' });
    assert.equal(r.status, 429, 'even the right password waits until the lock ends');
    assert.match(r.body.error, /Too many wrong passwords/);
  });

  test('broken JSON gets a 400, not a server error', async () => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(r.status, 400);
  });

  test("owners can't leave their own board; members can", async () => {
    const o = await signup('Owner Leaves', 'oleave@example.edu');
    const b = (await o.c.post('/boards', { title: 'Mine', template: 'blank' })).body.board;
    const r = await o.c.del(`/boards/${b.id}/members/${o.id}`);
    assert.equal(r.status, 403);
    assert.match(r.body.error, /Delete the board instead/);
    const link = (await o.c.post(`/boards/${b.id}/invite-link`, { role: 'member' })).body.board.inviteLink.token;
    const m = await signup('Member Leaves', 'mleave@example.edu');
    await m.c.post(`/join/${link}`);
    assert.equal((await m.c.del(`/boards/${b.id}/members/${m.id}`)).status, 200);
    assert.equal((await m.c.get(`/boards/${b.id}`)).status, 404);
  });
});

describe('forgot password', () => {
  const sent = () => mail.filter((m) => /Reset your/.test(m.subject));
  const tokenFrom = (text: string) => tokenIn(text, 'reset-password');

  test("unknown emails get the same answer and no email", async () => {
    const r = await new Client().post('/auth/forgot', { email: 'nobody-here@example.edu' });
    assert.equal(r.status, 200);
    assert.equal(mailsTo('nobody-here@example.edu', /./).length, 0);
  });

  test('the emailed link sets a new password once, and logs you in', async () => {
    await signup('Fiona Forgetful', 'fiona@example.edu');
    assert.equal((await new Client().post('/auth/forgot', { email: 'FIONA@example.edu' })).status, 200);
    const fiona = mailsTo('fiona@example.edu', /Reset your/);
    assert.equal(fiona.length, 1);
    const token = tokenFrom(fiona[0].text);
    assert.ok(token.length > 30, 'email contains a reset link');

    const c = new Client();
    const r = await c.post('/auth/reset', { token, password: 'brand-new-pass' });
    assert.equal(r.status, 200);
    assert.equal((await c.get('/auth/me')).body.user.email, 'fiona@example.edu');

    assert.equal((await new Client().post('/auth/login', { email: 'fiona@example.edu', password: 'password123' })).status, 401);
    assert.equal((await new Client().post('/auth/login', { email: 'fiona@example.edu', password: 'brand-new-pass' })).status, 200);
    assert.equal((await new Client().post('/auth/reset', { token, password: 'another-pass-1' })).status, 410); // used up
  });

  test('asking again within a minute does not send a second email', async () => {
    await signup('Rita Repeat', 'rita@example.edu');
    await new Client().post('/auth/forgot', { email: 'rita@example.edu' });
    await new Client().post('/auth/forgot', { email: 'rita@example.edu' });
    assert.equal(mailsTo('rita@example.edu', /Reset your/).length, 1);
  });

  test('made-up tokens and short passwords are rejected', async () => {
    assert.equal((await new Client().post('/auth/reset', { token: 'x'.repeat(43), password: 'long-enough-1' })).status, 410);
    const t = tokenFrom(sent().at(-1)!.text);
    assert.equal((await new Client().post('/auth/reset', { token: t, password: 'short' })).status, 400);
  });
});

describe('continue with Google', () => {
  // Stand-in for Google's token check: the "credential" is just JSON describing the Google account.
  before(async () => {
    const { google } = await import('../src/auth.js');
    const { HttpError } = await import('../src/http.js');
    google.verify = async (credential: string) => {
      const p = JSON.parse(credential);
      if (p.bad) throw new HttpError(401, "Couldn't verify your Google sign-in. Try again.");
      return { sub: p.sub, email: p.email, name: p.name, picture: p.picture };
    };
    google.verifyAccessToken = google.verify; // same stand-in for the styled button's access tokens
  });

  test('the styled button (access token) signs in the same way', async () => {
    const c = new Client();
    const r = await c.post('/auth/google', { accessToken: cred({ sub: 'g-at', email: 'tara@gmail.com', name: 'Tara Token' }) });
    assert.equal(r.status, 201);
    assert.equal((await c.get('/auth/me')).body.user.name, 'Tara Token');
    assert.equal((await new Client().post('/auth/google', {})).status, 400);
  });
  const cred = (o: object) => JSON.stringify({ name: 'G User', picture: 'https://lh3.googleusercontent.com/a/x', ...o });

  test('creates an account the first time, then logs into the same one', async () => {
    const c = new Client();
    const first = await c.post('/auth/google', { credential: cred({ sub: 'g-1', email: 'gina@gmail.com', name: 'Gina Google' }) });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.name, 'Gina Google');
    assert.equal(first.body.user.avatarUrl, 'https://lh3.googleusercontent.com/a/x');
    assert.equal((await c.get('/auth/me')).body.user.email, 'gina@gmail.com');

    const again = await new Client().post('/auth/google', { credential: cred({ sub: 'g-1', email: 'gina@gmail.com' }) });
    assert.equal(again.status, 200);
    assert.equal(again.body.user.id, first.body.user.id);
  });

  test('links to an existing, confirmed email-and-password account instead of making a second one', async () => {
    const { id } = await signup('Paula Password', 'paula@gmail.com');
    await verify('paula@gmail.com');
    const r = await new Client().post('/auth/google', { credential: cred({ sub: 'g-2', email: 'paula@gmail.com' }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, id);
    // The password still works too.
    assert.equal((await new Client().post('/auth/login', { email: 'paula@gmail.com', password: 'password123' })).status, 200);
  });

  test("someone who pre-registered your Gmail can't keep access once you continue with Google", async () => {
    const squatter = await signup('Squatter', 'real.person@gmail.com'); // never confirmed the email
    const r = await new Client().post('/auth/google', { credential: cred({ sub: 'g-real', email: 'real.person@gmail.com' }) });
    assert.equal(r.status, 200);
    assert.equal((await squatter.c.get('/auth/me')).status, 401, "squatter's session ended");
    assert.equal((await new Client().post('/auth/login', { email: 'real.person@gmail.com', password: 'password123' })).status, 401, "squatter's password removed");
    assert.equal(r.body.user.emailVerified, true);
  });

  test("Google-only accounts get a clear message when they try a password", async () => {
    const r = await new Client().post('/auth/login', { email: 'gina@gmail.com', password: 'whatever123' });
    assert.equal(r.status, 401);
    assert.match(r.body.error, /Google/);
    const s = await new Client().post('/auth/signup', { name: 'Gina Again', email: 'gina@gmail.com', password: 'password123' });
    assert.equal(s.status, 409);
    assert.match(s.body.error, /Google/);
  });

  test('a credential Google rejects does not log anyone in', async () => {
    const c = new Client();
    assert.equal((await c.post('/auth/google', { credential: cred({ bad: true, sub: 'x', email: 'x@gmail.com' }) })).status, 401);
    assert.equal((await c.get('/auth/me')).status, 401);
  });

  test("user lists never include password hashes", async () => {
    const { c } = await signup('Hash Check', 'hash@example.edu');
    const b = await c.post('/boards', { title: 'Secrets?', template: 'blank' });
    const json = JSON.stringify(b.body);
    assert.equal(json.includes('passwordHash'), false);
    assert.equal(json.includes('$2a$'), false); // bcrypt prefix
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

  test('deleting a list keeps its archived cards in the Archive', async () => {
    const spare = (await owner.c.post(`/boards/${boardId}/lists`, { title: 'Old ideas' })).body.board.listOrder.at(-1);
    const id = (await owner.c.post(`/lists/${spare}/cards`, { title: 'Shelved idea' })).body.cardId;
    await owner.c.post(`/cards/${id}/archive`);
    const r = await owner.c.del(`/lists/${spare}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.board.cards[id]?.archived, true, 'archived card still exists');
    const back = await owner.c.post(`/cards/${id}/restore`);
    assert.ok(back.body.board.lists[lists[0]].cardIds.includes(id), 'restored into the first list');
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
    assert.equal(mailsTo('vera@example.edu', /invited you/).length, 1, 'the invite was emailed');
    await verify('vera@example.edu');
    const boot = await viewer.c.get('/bootstrap');
    assert.equal(boot.body.incoming.length, 1);
    assert.equal((await viewer.c.post(`/invites/${boot.body.incoming[0].id}/accept`)).status, 200);

    // Member: joins with an invite link.
    const link = (await owner.c.post(`/boards/${boardId}/invite-link`, { role: 'member' })).body.board.inviteLink;
    member = await signup('Mina Member', 'mina@example.edu');
    assert.equal((await member.c.post(`/join/${link.token}`)).status, 200);

    outsider = await signup('Otto Outsider', 'otto@example.edu');
  });

  test('members and viewers never receive the invite link or pending invite emails', async () => {
    await owner.c.post(`/boards/${boardId}/invites`, { email: 'pending@example.edu', role: 'member' });
    const asOwner = (await owner.c.get(`/boards/${boardId}`)).body.board;
    assert.ok(asOwner.inviteLink?.token, 'owner sees the link');
    assert.ok(asOwner.invites.length > 0, 'owner sees pending invites');
    for (const who of [viewer, member]) {
      const b = (await who.c.get(`/boards/${boardId}`)).body.board;
      assert.equal(b.inviteLink, null);
      assert.deepEqual(b.invites, []);
    }
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
