# Crewboard (Trello_AI)

A Kanban board for student and small-team projects: boards, lists and cards, assignees, due dates, labels, comments with @mentions, invitations with roles, an activity log and notifications, with live updates between teammates over WebSockets.

## Databases

| Where | Database | Data |
|---|---|---|
| Live site (Render) | PostgreSQL on Neon | Real data only: the accounts and boards people create. |
| Your laptop | SQLite file `backend/prisma/dev.db` | Starts empty. Sign up locally to try changes. Never uploaded. |
| Automated tests | SQLite file `backend/prisma/test.db` | Temporary accounts the tests create and wipe on every run. |

The app picks the database from `DATABASE_URL`: a `postgresql://` address uses PostgreSQL, anything else uses SQLite (`backend/scripts/prisma-provider.mjs`).

## Deploy (Render + Neon, both free)

The whole app runs as **one Render web service**: the API serves the built React app, so the login cookie and live updates work on a single domain.

1. **Neon:** create a project at neon.tech and copy the connection string (`postgresql://…?sslmode=require`).
2. **Render:** New → **Blueprint** → pick this GitHub repo. Render reads `render.yaml`.
   When it asks for `DATABASE_URL`, paste the Neon connection string. `JWT_SECRET` is generated for you.
3. Render runs `npm run build`, then `npm start`. On start, `prisma db push` creates the tables in Neon (empty).
4. Open the Render URL, sign up as the first real user, create a board, and invite your team.

Every push to `main` redeploys automatically. The free plan sleeps after 15 minutes idle; the first visit after that takes about 30–50 seconds.

## "Continue with Google"

Sign-in with Google uses only the **OAuth Client ID**; no client secret is needed. The browser gets a short-lived access token from Google, and the backend verifies it (`backend/src/auth.ts`) before logging the person in. Someone who already signed up with the same email gets their existing account, not a second one.

1. Google Cloud Console → **APIs & Services → Credentials** → your OAuth 2.0 Client ID (type **Web application**).
2. Under **Authorized JavaScript origins**, add every address the app is opened from:
   - `http://localhost:5173` and `http://localhost:5174` (local)
   - your Render URL, e.g. `https://crewboard.onrender.com`
   No redirect URIs are needed.
3. Put the Client ID in `backend/.env` as `GOOGLE_CLIENT_ID` (local) and in Render's environment variables (live).

If `GOOGLE_CLIENT_ID` is empty, the Google button is hidden and email sign-in works as before.

## Run it locally

You need Node 20+. Two terminals:

```bash
# 1. API (http://localhost:4000)
cd backend
npm install
npm run setup     # creates an empty local SQLite database
npm run dev

# 2. Web app (http://localhost:5173)
cd frontend
npm install
npm run dev
```

If port 5173 is busy, Vite picks the next free one (5174, …) and prints it.

Open the app, sign up, and create a board. To try live updates, sign up a second account in a private window and invite it to the board.

`npm run db:reset` (in `backend/`) empties the local database.

### Tests
`npm test` in `backend/` runs 29 API tests (sign-in, Google, forgot password, card ordering, validation, roles, invitations, notifications) against a separate `prisma/test.db`. They never touch your local or live data.

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
| `backend/src/routes.ts` | All REST endpoints |
| `backend/src/realtime.ts` | Socket.IO rooms, presence, broadcasts |
| `backend/src/snapshot.ts` | Turns a board into the JSON shape the frontend uses |
| `frontend/src/store/useStore.ts` | App state and every action (optimistic update + API call) |
| `frontend/src/lib/api.ts`, `lib/realtime.ts` | HTTP client and socket connection |
| `frontend/src/index.css`, `tailwind.config.js` | Colour tokens (beige, graphite, yellow; light and dark) |

### Looking inside the database
`npm run studio` in `backend/` opens Prisma Studio in your browser for whichever database `DATABASE_URL` points to. On the live database, Neon's dashboard also has a table viewer and SQL editor.
