import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, LayoutGrid, LogOut, MailWarning, MonitorX, Settings, ShieldCheck, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import { Logo } from './ui/Logo';
import { ThemeToggle } from './ui/ThemeToggle';
import { Avatar } from './ui/Avatar';
import { Popover, MenuItem } from './ui/Popover';
import { useStore } from '../store/useStore';
import { ago } from '../lib/dates';
import { firstName } from '../lib/id';

export function AppHeader() {
  const online = useStore((s) => s.online);
  const me = useStore((s) => s.users[s.me]);
  const resend = useStore((s) => s.resendVerification);
  const adminPending = useStore((s) => s.adminPending);
  const confirmRequired = useStore((s) => s.confirmRequired);
  const [sending, setSending] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-soon px-4 py-1.5 text-sm text-soon-fg">
          <WifiOff size={14} /> Reconnecting… changes from your team will appear when you’re back online.
        </div>
      )}
      {me && me.emailVerified === false && (confirmRequired || adminPending) && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-accent-soft px-4 py-2 text-center text-sm">
          <MailWarning size={15} className="shrink-0" />
          <span>
            {adminPending ? (
              <>
                <b>You're listed as a site admin.</b> Confirm your email to open the admin panel: we sent a link to <b>{me.email}</b>. Or log out and
                use <b>Continue with Google</b> with this address, which confirms it right away.
              </>
            ) : (
              <>
                Confirm your email: we sent a link to <b>{me.email}</b>. You need it to accept invitations.
              </>
            )}
          </span>
          <button
            className="font-semibold underline decoration-2 underline-offset-4 hover:decoration-ink disabled:opacity-60"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              await resend();
              setSending(false);
            }}
          >
            {sending ? 'Sending…' : 'Send it again'}
          </button>
        </div>
      )}
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Logo to="/boards" />
        <Link to="/boards" className="btn-quiet ml-2 hidden sm:inline-flex">
          <LayoutGrid size={16} /> Boards
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function NotificationBell() {
  const notifications = useStore((s) => s.notifications);
  const users = useStore((s) => s.users);
  const boards = useStore((s) => s.boards);
  const markRead = useStore((s) => s.markRead);
  const markAllRead = useStore((s) => s.markAllRead);
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Popover
      align="right"
      className="w-[min(22rem,calc(100vw-2rem))]"
      trigger={({ toggle }) => (
        <button className="btn-quiet relative h-9 w-9 p-0" onClick={toggle} aria-label={`Notifications, ${unread} unread`}>
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-mono text-[9px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="font-display font-bold">Notifications</span>
            {unread > 0 && (
              <button className="text-xs font-semibold text-focus hover:underline" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-2.5 pb-4 pt-1 text-sm text-muted">
              Nothing yet. You'll hear about it here when someone assigns you a card or @mentions you.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    className={clsx('flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-column', !n.read && 'bg-accent-soft/60')}
                    onClick={() => {
                      markRead(n.id);
                      close();
                      navigate(n.cardId ? `/b/${n.boardId}/c/${n.cardId}` : `/b/${n.boardId}`);
                    }}
                  >
                    <Avatar userId={n.actorId} size="md" />
                    <span className="min-w-0 text-sm">
                      <b className="font-semibold">{firstName(users[n.actorId]?.name ?? 'Someone')}</b> {n.text}
                      <span className="block text-xs text-muted">
                        {boards[n.boardId]?.title} · {ago(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const meId = useStore((s) => s.me);
  const me = useStore((s) => s.users[s.me]);
  const logout = useStore((s) => s.logout);
  const logoutEverywhere = useStore((s) => s.logoutEverywhere);
  const isAdmin = useStore((s) => s.isAdmin);
  const navigate = useNavigate();
  return (
    <Popover
      align="right"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="ml-1 rounded-full" aria-label="Account menu">
          <Avatar userId={meId} size="md" />
        </button>
      )}
    >
      {() => (
        <div>
          <div className="px-2.5 py-2">
            <div className="font-semibold">{me?.name}</div>
            <div className="truncate text-xs text-muted">{me?.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem onClick={() => navigate('/settings')}>
            <Settings size={15} /> Profile & settings
          </MenuItem>
          {isAdmin && (
            <>
              <MenuItem onClick={() => navigate('/admin')}>
                <ShieldCheck size={15} /> Admin panel
              </MenuItem>
              <div className="my-1 border-t border-line" />
            </>
          )}
          <MenuItem
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut size={15} /> Log out
          </MenuItem>
          <MenuItem
            onClick={async () => {
              await logoutEverywhere();
              navigate('/login');
            }}
          >
            <MonitorX size={15} /> Log out on every device
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}
