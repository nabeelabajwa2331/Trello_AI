# Crewboard (Trello_AI)

A Kanban board for student and small-team projects: boards, lists and cards, assignees, due dates, labels, comments with @mentions, invitations with roles, an activity log and notifications, with live updates between teammates over WebSockets.

## Run it

You need Node 18+. Two terminals:

```bash
# 1. API (http://localhost:4000)
cd backend
npm install
npm run setup     # creates the SQLite database and fills it with demo data
npm run dev

# 2. Web app (http://localhost:5173)
cd frontend
npm install
npm run dev
```

If port 5173 is busy, Vite picks the next free one (5174, …) and prints it.

### Demo accounts
All use the password `password123`.

| Email | Role on "CS-301 Final Project" |
|---|---|
| demo@crewboard.app | Owner |
| sara@example.edu | Admin |
| hamza@example.edu, ayesha@example.edu | Member |
| omar@example.edu | Not on it. Owns two other boards and has invited Demo to one |

**To see real-time updates:** log in as Demo in a normal window and as Sara in a private window, open the same board in both, and drag a card.

`npm run db:reset` (in `backend/`) wipes the database and reloads the demo data.

### Tests
`npm test` in `backend/` runs 19 API tests (auth, card ordering, validation, roles, invitations, notifications) against a separate `prisma/test.db`, so your demo data is never touched.

## How it fits together

```
React (Vite) ──REST /api──▶ Express ──Prisma──▶ SQLite
     ▲                          │
     └──── Socket.IO ◀──────────┘  after every change: "board:sync" to everyone on that board
```

- **Auth:** email and password, bcrypt hashes, JWT in an httpOnly cookie. The socket uses the same cookie.
- **Every change** goes through one `mutate()` helper on the server (`backend/src/routes.ts`): check role → apply → write the activity log → push the full board to the board's room.
- **Optimistic UI:** the frontend changes the screen immediately, then replaces it with the server's board. If the server refuses, a toast explains why and the board reloads, so the change rolls back.
- **Card order** uses fractional positions, so a move rewrites one row. Lists renumber themselves if the gaps get too small.
- **Permissions** (Owner / Admin / Member / Viewer) are checked on the server in `backend/src/permissions.ts`. The frontend copy in `frontend/src/lib/permissions.ts` only hides buttons.
- **Rooms:** `user:<id>` for notifications, `board:<id>` for board changes and presence (who has the board open).
- **Notifications** are sent when someone assigns you, @mentions you by first name, or invites you.

### Where things live

| Path | What it is |
|---|---|
| `backend/prisma/schema.prisma` | Data model |
| `backend/prisma/seed.ts` | Demo data |
| `backend/src/routes.ts` | All REST endpoints |
| `backend/src/realtime.ts` | Socket.IO rooms, presence, broadcasts |
| `backend/src/snapshot.ts` | Turns a board into the JSON shape the frontend uses |
| `frontend/src/store/useStore.ts` | App state and every action (optimistic update + API call) |
| `frontend/src/lib/api.ts`, `lib/realtime.ts` | HTTP client and socket connection |
| `frontend/src/index.css`, `tailwind.config.js` | Colour tokens (beige, graphite, yellow; light and dark) |

### Switching to PostgreSQL
In `backend/prisma/schema.prisma` set `provider = "postgresql"`, put a Postgres URL in `backend/.env` as `DATABASE_URL`, then run `npm run setup`.
