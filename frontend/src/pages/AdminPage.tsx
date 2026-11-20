import { useCallback, useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Mail,
  Minus,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { Dialog } from '../components/ui/Dialog';
import { Popover, MenuItem } from '../components/ui/Popover';
import { api, errorMessage } from '../lib/api';
import { ago } from '../lib/dates';
import { initials } from '../lib/id';
import { useStore } from '../store/useStore';
import NotFound from './NotFound';

/* ------------------------------------------------------------------ types from /api/admin */

type Overview = {
  users: number;
  verified: number;
  google: number;
  suspended: number;
  newThisWeek: number;
  activeToday: number;
  boards: number;
  cards: number;
  comments: number;
  signups: { date: string; count: number }[];
  system: {
    email: boolean;
    emailProvider: 'brevo' | 'smtp' | 'none';
    google: boolean;
    appUrl: string | null;
    appUrlSource: 'APP_URL' | 'Render' | null;
    admins: string[];
  };
};
type AdminUser = {
  id: string;
  name: string;
  email: string;
  color: string;
  avatarUrl: string | null;
  createdAt: string;
  emailVerified: boolean;
  signIn: ('email' | 'google')[];
  suspended: boolean;
  isAdmin: boolean;
  boards: number;
  owns: number;
  lastActive: string | null;
};
type AdminBoard = {
  id: string;
  title: string;
  cover: string;
  createdAt: string;
  updatedAt: string;
  owner: { name: string; email: string } | null;
  members: number;
  lists: number;
  cards: number;
};
type Page<T> = { total: number; page: number; pages: number } & T;

type Tab = 'overview' | 'users' | 'boards';

export default function AdminPage() {
  const isAdmin = useStore((s) => s.isAdmin);
  const [tab, setTab] = useState<Tab>('overview');
  if (!isAdmin)
    return (
      <>
        <AppHeader />
        <NotFound />
      </>
    );

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ['users', 'Users'],
    ['boards', 'Boards'],
  ];
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <ShieldCheck size={13} /> Site admin
            </p>
            <h1 className="mt-1 font-wide text-3xl font-extrabold tracking-tight">Admin panel</h1>
            <p className="mt-1 text-sm text-muted">Accounts and usage for the whole site. Board contents stay private to their members.</p>
          </div>
        </div>
        <div role="tablist" className="flex gap-1 border-b border-line">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={clsx(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold',
                tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'boards' && <BoardsTab />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Overview>('/admin/overview')
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const pct = (n: number) => (data.users ? Math.round((n / data.users) * 100) : 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={data.users} note={`${data.newThisWeek} new this week`} />
        <Stat label="Active today" value={data.activeToday} note="made a change in 24 h" />
        <Stat label="Boards" value={data.boards} />
        <Stat label="Cards" value={data.cards} note="not archived" />
        <Stat label="Comments" value={data.comments} />
        <Stat label="Suspended" value={data.suspended} note={data.suspended ? 'see Users' : 'none'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-modal border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">New signups, last 14 days</h2>
            <span className="font-mono text-xs text-muted">{data.signups.reduce((n, d) => n + d.count, 0)} total</span>
          </div>
          <SignupChart days={data.signups} />
        </section>

        <section className="flex flex-col gap-4 rounded-modal border border-line bg-surface p-5">
          <h2 className="text-base font-bold">Accounts</h2>
          <Bar label="Email confirmed" value={data.verified} total={data.users} pct={pct(data.verified)} />
          <Bar label="Use Google sign-in" value={data.google} total={data.users} pct={pct(data.google)} />
          <h2 className="mt-2 text-base font-bold">System</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <SystemRow
              ok={data.system.email}
              optional
              label={
                data.system.emailProvider === 'brevo'
                  ? 'Email sending (Brevo)'
                  : data.system.emailProvider === 'smtp'
                    ? 'Email sending (SMTP)'
                    : 'Email sending: off (optional)'
              }
              fix="Not needed for now. Forgotten passwords are reset from Users → Set a new password. Turn email on later with the SMTP settings on Render if you need it."
            />
            <SystemRow ok={data.system.google} label="Google sign-in" fix="Set GOOGLE_CLIENT_ID on Render." />
            <SystemRow
              ok={!!data.system.appUrl}
              label={
                data.system.appUrl
                  ? `Site address: ${data.system.appUrl}${data.system.appUrlSource === 'Render' ? ' (detected from Render)' : ''}`
                  : 'Site address (APP_URL)'
              }
              fix="Set APP_URL so links in emails always point to the live site."
            />
          </ul>
          <p className="text-xs text-muted">Admins: {data.system.admins.join(', ')}</p>
          {data.system.email && <EmailTest />}
        </section>
      </div>
    </div>
  );
}

/** Check the email connection, then send a real test message to see it arrive. */
function EmailTest() {
  const [to, setTo] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Test email</span>
        <button
          className="btn-ghost h-8 px-2.5 text-xs"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('check');
            try {
              setCheck(await api<{ ok: boolean; error?: string }>('/admin/email-check'));
            } catch (e) {
              setCheck({ ok: false, error: errorMessage(e) });
            }
            setBusy(null);
          }}
        >
          {busy === 'check' ? 'Checking…' : 'Check connection'}
        </button>
      </div>
      {check && (
        <p className={clsx('rounded-[8px] px-2.5 py-1.5 text-xs', check.ok ? 'bg-done text-done-fg' : 'bg-over text-over-fg')}>
          {check.ok ? 'Connected. The email settings work.' : check.error}
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!to.trim()) return;
          setBusy('send');
          try {
            await api('/admin/test-email', 'POST', { to: to.trim() });
            toast(`Test email sent to ${to.trim()}. Check the inbox and the spam folder.`);
          } catch (err) {
            toast.error(errorMessage(err));
          }
          setBusy(null);
        }}
      >
        <label htmlFor="test-email-to" className="sr-only">
          Send a test email to
        </label>
        <input
          id="test-email-to"
          type="email"
          className="input h-9 min-w-0 flex-1 text-xs"
          placeholder="you@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button className="btn-primary h-9 px-3 text-xs" disabled={busy !== null || !to.trim()}>
          {busy === 'send' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-modal border border-line bg-surface p-4">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="font-wide text-2xl font-extrabold tabular-nums">{value.toLocaleString()}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

function Bar({ label, value, total, pct }: { label: string; value: number; total: number; pct: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted tabular-nums">
          {value} of {total} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-column" role="img" aria-label={`${label}: ${pct}%`}>
        <div className="h-full rounded-full bg-chart" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A setup line. `optional` items that are off show as a calm gray dash, not a warning. */
function SystemRow({ ok, label, fix, optional }: { ok: boolean; label: string; fix: string; optional?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={clsx(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
          ok ? 'bg-done text-done-fg' : optional ? 'bg-column text-muted' : 'bg-soon text-soon-fg',
        )}
      >
        {ok ? <Check size={12} strokeWidth={3} /> : optional ? <Minus size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
      </span>
      <span>
        <span className="font-medium">{label}</span>
        <span className="sr-only">{ok ? ': set up' : optional ? ': off' : ': not set up'}</span>
        {!ok && <span className="block text-xs text-muted">{fix}</span>}
      </span>
    </li>
  );
}

/** Single-series bar chart (no legend needed; the title names it). */
function SignupChart({ days }: { days: { date: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const niceMax = max <= 4 ? max : Math.ceil(max / 5) * 5;
  const h = 160;
  return (
    <div className="mt-4">
      <div className="relative flex gap-2">
        {/* y axis: just zero and the top value */}
        <div
          className="flex w-6 flex-col justify-between text-right font-mono text-[10px] text-muted"
          style={{ height: h }}
          aria-hidden="true"
        >
          <span>{niceMax}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden="true" />
          <div className="absolute inset-x-0 border-t border-line" style={{ top: h }} aria-hidden="true" />
          <div className="relative flex items-end gap-[2px]" style={{ height: h }} onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => {
              const barH = d.count ? Math.max(4, (d.count / niceMax) * h) : 0;
              return (
                <button
                  key={d.date}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${format(parseISO(d.date), 'EEE, MMM d')}: ${d.count} signups`}
                >
                  <span
                    className={clsx('w-full max-w-[28px] rounded-t-[4px] bg-chart', hover !== null && hover !== i && 'opacity-50')}
                    style={{ height: barH }}
                  />
                  {d.count === 0 && <span className="absolute bottom-0 h-px w-full max-w-[28px] bg-line" />}
                </button>
              );
            })}
          </div>
          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop"
              style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
              role="status"
            >
              <span className="block font-semibold text-ink">
                {days[hover].count} signup{days[hover].count === 1 ? '' : 's'}
              </span>
              <span className="text-muted">{format(parseISO(days[hover].date), 'EEEE, MMM d')}</span>
            </div>
          )}
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted" aria-hidden="true">
            <span>{format(parseISO(days[0].date), 'MMM d')}</span>
            <span>{format(parseISO(days[Math.floor(days.length / 2)].date), 'MMM d')}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>New signups per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Signups</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ users */

const USER_FILTERS = [
  ['all', 'All'],
  ['unverified', 'Email not confirmed'],
  ['google', 'Google'],
  ['suspended', 'Suspended'],
] as const;

function UsersTab() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<(typeof USER_FILTERS)[number][0]>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<{ users: AdminUser[]; emailConfirmation?: boolean }> | null>(null);
  // Hide confirmed / not confirmed when REQUIRE_EMAIL_CONFIRMATION is off.
  const confirm = data?.emailConfirmation ?? false;
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, filter]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ filter, page: String(page), ...(debounced ? { q: debounced } : {}) });
    api<Page<{ users: AdminUser[] }>>(`/admin/users?${p}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [debounced, filter, page]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search users</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="admin-user-search"
            className="input pl-9"
            placeholder="Search by name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {USER_FILTERS.filter(([k]) => confirm || k !== 'unverified').map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={clsx(
                'rounded-full border px-3 py-1.5 text-xs font-semibold',
                filter === k ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-muted hover:border-ink hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-modal border border-line bg-surface md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-bg">
                <tr>
                  {['Person', 'Signed up', 'Sign-in', 'Email', 'Boards', 'Last active', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((u) => (
                  <tr key={u.id} className={clsx(u.suspended && 'bg-over/40')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PersonAvatar u={u} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate font-semibold">
                            {u.name}
                            {u.isAdmin && <Badge tone="ink">Admin</Badge>}
                            {u.suspended && <Badge tone="over">Suspended</Badge>}
                          </div>
                          <div className="truncate text-xs text-muted">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted" title={format(parseISO(u.createdAt), 'PPpp')}>
                      {format(parseISO(u.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {u.signIn.map((m) => (
                          <Badge key={m}>{m === 'google' ? 'Google' : 'Password'}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!confirm ? (
                        <span className="text-muted">—</span>
                      ) : u.emailVerified ? (
                        <Badge tone="done">Confirmed</Badge>
                      ) : (
                        <Badge tone="soon">Not confirmed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {u.boards}
                      {u.owns > 0 && <span className="text-xs text-muted"> · owns {u.owns}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{u.lastActive ? ago(u.lastActive) : 'never'}</td>
                    <td className="px-2 py-3 text-right">
                      <UserActions
                        u={u}
                        act={act}
                        onDelete={() => setDeleting(u)}
                        onSetPassword={() => setResetting(u)}
                        confirm={confirm}
                      />
                    </td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      No users match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per person instead of a wide table */}
          <ul className="flex flex-col gap-2 md:hidden">
            {data.users.map((u) => (
              <li
                key={u.id}
                className={clsx('flex flex-col gap-2.5 rounded-modal border border-line bg-surface p-3.5', u.suspended && 'bg-over/40')}
              >
                <div className="flex items-start gap-3">
                  <PersonAvatar u={u} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                      <span className="truncate">{u.name}</span>
                      {u.isAdmin && <Badge tone="ink">Admin</Badge>}
                      {u.suspended && <Badge tone="over">Suspended</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted">{u.email}</div>
                  </div>
                  <UserActions u={u} act={act} onDelete={() => setDeleting(u)} onSetPassword={() => setResetting(u)} confirm={confirm} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {confirm && (u.emailVerified ? <Badge tone="done">Confirmed</Badge> : <Badge tone="soon">Not confirmed</Badge>)}
                  {u.signIn.map((m) => (
                    <Badge key={m}>{m === 'google' ? 'Google' : 'Password'}</Badge>
                  ))}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Signed up</dt>
                    <dd className="font-medium">{format(parseISO(u.createdAt), 'MMM d, yyyy')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Boards</dt>
                    <dd className="font-medium tabular-nums">
                      {u.boards}
                      {u.owns > 0 && ` · owns ${u.owns}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Last active</dt>
                    <dd className="font-medium">{u.lastActive ? ago(u.lastActive) : 'never'}</dd>
                  </div>
                </dl>
              </li>
            ))}
            {data.users.length === 0 && (
              <li className="rounded-modal border border-line bg-surface px-4 py-10 text-center text-muted">No users match.</li>
            )}
          </ul>
          <Pager page={data.page} pages={data.pages} total={data.total} noun="user" onPage={setPage} />
        </>
      )}

      <SetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <DeleteUserDialog
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(r) => {
          setDeleting(null);
          toast(`Account deleted. Boards handed over: ${r.transferred}. Boards deleted (nobody else on them): ${r.deleted}.`);
          load();
        }}
      />
    </div>
  );
}

function UserActions({
  u,
  act,
  onDelete,
  onSetPassword,
  confirm,
}: {
  u: AdminUser;
  act: (fn: () => Promise<unknown>, done: string) => Promise<void>;
  onDelete: () => void;
  onSetPassword: () => void;
  confirm: boolean;
}) {
  if (u.isAdmin) return null;
  return (
    <Popover
      align="right"
      className="w-60"
      trigger={({ toggle }) => (
        <button className="btn-quiet h-8 w-8 shrink-0 p-0" onClick={toggle} aria-label={`Actions for ${u.name}`}>
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      {(close) => (
        <>
          {confirm && !u.emailVerified && (
            <MenuItem
              onClick={() => {
                close();
                void act(() => api(`/admin/users/${u.id}/resend-verification`, 'POST'), `Confirmation email sent to ${u.email}`);
              }}
            >
              <Mail size={15} /> Resend confirmation email
            </MenuItem>
          )}
          {u.suspended ? (
            <MenuItem
              onClick={() => {
                close();
                void act(() => api(`/admin/users/${u.id}/suspend`, 'POST', { suspended: false }), `${u.name} can log in again`);
              }}
            >
              <UserCheck size={15} /> Unsuspend
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => {
                close();
                void act(() => api(`/admin/users/${u.id}/suspend`, 'POST', { suspended: true }), `${u.name} is suspended and logged out`);
              }}
            >
              <Ban size={15} /> Suspend (blocks login)
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              close();
              onSetPassword();
            }}
          >
            <KeyRound size={15} /> Set a new password…
          </MenuItem>
          <div className="my-1 border-t border-line" />
          <MenuItem
            danger
            onClick={() => {
              close();
              onDelete();
            }}
          >
            <Trash2 size={15} /> Delete account…
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

/** For someone who forgot their password while email is off. Tell them the new one yourself. */
function SetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPassword('');
    setError('');
  }, [user]);
  if (!user) return null;
  return (
    <Dialog open onClose={onClose} title={`New password for ${user.name}`}>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setError('Use at least 8 characters.');
          setBusy(true);
          try {
            await api(`/admin/users/${user.id}/password`, 'POST', { password });
            toast(`New password set for ${user.name}. They’ve been logged out everywhere.`);
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
          setBusy(false);
        }}
      >
        <p className="text-sm text-muted">
          Use this when someone forgot their password. Give them the new one in person or by message, and ask them to change it in{' '}
          <b className="text-ink">Profile & settings</b> after logging in.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="admin-new-password" className="text-sm font-semibold">
            New password for {user.email}
          </label>
          <input
            id="admin-new-password"
            data-autofocus
            type="text"
            className="input font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onDeleted: (r: { transferred: number; deleted: number }) => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setTyped(''), [user]);
  if (!user) return null;
  const ready = typed.trim().toLowerCase() === user.email;
  return (
    <Dialog open onClose={onClose} title="Delete this account?">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          try {
            onDeleted(await api<{ transferred: number; deleted: number }>(`/admin/users/${user.id}`, 'DELETE'));
          } catch (err) {
            toast.error(errorMessage(err));
          }
          setBusy(false);
        }}
      >
        <p>
          This permanently deletes <b>{user.name}</b> ({user.email}), their comments and their card assignments. It can’t be undone.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted">
          <li>Boards they own with other people on them go to the next person (an admin first).</li>
          <li>Boards where they are the only person are deleted.</li>
        </ul>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-delete-email" className="text-sm font-semibold">
            Type their email to confirm
          </label>
          <input
            id="confirm-delete-email"
            data-autofocus
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={user.email}
            autoComplete="off"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger" disabled={!ready || busy}>
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ boards */

function BoardsTab() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<{ boards: AdminBoard[] }> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced]);
  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), ...(debounced ? { q: debounced } : {}) });
    api<Page<{ boards: AdminBoard[] }>>(`/admin/boards?${p}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [debounced, page]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search boards</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="admin-board-search"
            className="input pl-9"
            placeholder="Search by board name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted">Only names and counts are shown. Cards and comments stay private to each board’s members.</p>
      </div>
      {error ? (
        <ErrorBox message={error} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-modal border border-line bg-surface md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-bg">
                <tr>
                  {['Board', 'Owner', 'People', 'Lists', 'Cards', 'Created', 'Last change'].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.boards.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-semibold">
                        <span className="h-3 w-3 shrink-0 rounded" style={{ background: b.cover }} aria-hidden="true" />
                        {b.title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {b.owner ? (
                        <>
                          <div className="truncate">{b.owner.name}</div>
                          <div className="truncate text-xs text-muted">{b.owner.email}</div>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{b.members}</td>
                    <td className="px-4 py-3 tabular-nums">{b.lists}</td>
                    <td className="px-4 py-3 tabular-nums">{b.cards}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{format(parseISO(b.createdAt), 'MMM d, yyyy')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{ago(b.updatedAt)}</td>
                  </tr>
                ))}
                {data.boards.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      No boards match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per board */}
          <ul className="flex flex-col gap-2 md:hidden">
            {data.boards.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 rounded-modal border border-line bg-surface p-3.5">
                <span className="flex items-center gap-2.5 font-semibold">
                  <span className="h-3 w-3 shrink-0 rounded" style={{ background: b.cover }} aria-hidden="true" />
                  <span className="min-w-0 break-words">{b.title}</span>
                </span>
                <span className="truncate text-xs text-muted">{b.owner ? `Owner: ${b.owner.name} · ${b.owner.email}` : 'No owner'}</span>
                <dl className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">People</dt>
                    <dd className="font-medium tabular-nums">{b.members}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Lists</dt>
                    <dd className="font-medium tabular-nums">{b.lists}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Cards</dt>
                    <dd className="font-medium tabular-nums">{b.cards}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Changed</dt>
                    <dd className="font-medium">{ago(b.updatedAt)}</dd>
                  </div>
                </dl>
              </li>
            ))}
            {data.boards.length === 0 && (
              <li className="rounded-modal border border-line bg-surface px-4 py-10 text-center text-muted">No boards match.</li>
            )}
          </ul>
          <Pager page={data.page} pages={data.pages} total={data.total} noun="board" onPage={setPage} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

function PersonAvatar({ u }: { u: AdminUser }) {
  const [broken, setBroken] = useState(false);
  if (u.avatarUrl && !broken)
    return (
      <img
        src={u.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ background: u.color }}
      aria-hidden="true"
    >
      {initials(u.name)}
    </span>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: 'done' | 'soon' | 'over' | 'ink' }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold',
        tone === 'done' && 'bg-done text-done-fg',
        tone === 'soon' && 'bg-soon text-soon-fg',
        tone === 'over' && 'bg-over text-over-fg',
        tone === 'ink' && 'bg-ink text-surface',
        !tone && 'bg-column text-muted',
      )}
    >
      {children}
    </span>
  );
}

function Pager({
  page,
  pages,
  total,
  noun,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  noun: string;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted">
      <span className="tabular-nums">
        {total.toLocaleString()} {noun}
        {total === 1 ? '' : 's'}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button className="btn-ghost h-8 px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          <button className="btn-ghost h-8 px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const Loading = () => (
  <div className="rounded-modal border border-line bg-surface p-10 text-center text-sm text-muted" aria-busy="true">
    Loading…
  </div>
);

const ErrorBox = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-[8px] bg-over px-4 py-3 text-sm text-over-fg">
    {message}
  </p>
);
