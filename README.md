# Crewboard (Trello_AI)

A Kanban board for student and small-team projects: boards, lists and cards, assignees, due dates, labels, comments, invitations with roles, an activity log and notifications, with live updates between teammates.

## Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Stack: React 18, Vite, TypeScript, Tailwind CSS, dnd-kit (drag and drop), Zustand + Immer (state), React Router, Sonner (toasts), date-fns, lucide-react.

### Try the live updates
Open the same board in **two browser tabs**. Changes in one appear instantly in the other (via `BroadcastChannel`).
The "Live demo" toggle on a board also simulates a teammate moving cards and commenting.

### Where things live

| Path | What it is |
|---|---|
| `src/index.css`, `tailwind.config.js` | "Highlighter" palette tokens (light + dark) |
| `src/store/useStore.ts` | All app state and actions; every change logs activity and broadcasts |
| `src/lib/realtime.ts` | Real-time transport. Swap the 3 functions for Socket.IO when the backend exists |
| `src/lib/permissions.ts` | Owner / Admin / Member / Viewer permission matrix |
| `src/pages/Landing.tsx` | Landing page |
| `src/pages/BoardPage.tsx` | Board view, drag-and-drop, filters |
| `src/components/board/*` | Lists, cards, card modal, activity panel, share dialog |

### Connecting a backend later
- Replace the mock login in `src/pages/AuthPage.tsx` with your auth API.
- Load boards from the API (TanStack Query is a good fit) instead of `src/data/seed.ts`.
- In `src/lib/realtime.ts`, use `socket.emit` / `socket.on` with one room per board.
- Enforce the same permission matrix on the server.
