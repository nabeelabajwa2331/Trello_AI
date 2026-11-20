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

## Admin panel

`/admin` is for whoever runs the site (not board owners). It shows totals, a 14-day signups chart, setup status (email, Google, site address), a searchable user list, and a board list with counts only. Admins can resend confirmation emails, suspend accounts (blocks login and ends sessions) and delete accounts. A deleted user's boards go to the next person on them; boards with nobody else are deleted.

**Built-in admin (no personal Gmail):** set `SITE_ADMIN_EMAIL` (any address, e.g. `admin@crewboard.invalid`) and `SITE_ADMIN_PASSWORD` (12+ characters) on Render. On every start the server creates that account or updates its password, and it is always an admin. It logs in with that password only: "Continue with Google" and "Forgot password" are disabled for it, so whoever owns that address elsewhere can't take it over. To change the password, change it on Render.

**Email:** set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` (a Gmail App Password) and `MAIL_FROM`. If the host blocks SMTP, use a free `BREVO_API_KEY` instead. Admin panel → System has **Check connection** and **Send test email**.

Who else is an admin: set `ADMIN_EMAILS` on Render (comma-separated). The account must have **confirmed** that email, so nobody can become an admin by signing up with your address. Admins can't suspend or delete themselves or each other. Card and comment contents are never shown in the panel.

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

- **Auth:** email and password (bcrypt) or Google. The httpOnly cookie holds a signed token pointing at a row in the `Session` table, so logging out, "Log out on every device" and password resets end sessions immediately. The socket uses the same cookie.
- **Email confirmation (optional, off by default):** with `REQUIRE_EMAIL_CONFIRMATION=true`, signup sends a link and an account must confirm its email before accepting an email invite. Off suits demo and test accounts with made-up addresses; anyone who signs up with an invited address can then accept that invite. Either way, Google sign-in and reset links mark an email as confirmed, `ADMIN_EMAILS` admins need a confirmed email (sign in with Google), and if an unconfirmed password account is later claimed through Google, its password and sessions are removed.
- **Rate limits:** 30 sign-in attempts per 15 minutes per network, 6 emails per 15 minutes, and an account locks for 15 minutes after 8 wrong passwords.
- **Invite links** and pending invite emails are only sent to Owners and Admins.
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
