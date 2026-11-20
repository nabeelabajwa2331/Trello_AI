import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, KeyRound, MonitorX, UserRound } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { AppHeader } from '../components/AppHeader';
import { AvatarUploader, RemovePhotoButton } from '../components/AvatarUploader';
import { api, errorMessage } from '../lib/api';
import { useStore } from '../store/useStore';
import type { User } from '../types';

type Account = { user: User; hasPassword: boolean; usesGoogle: boolean; builtInAdmin: boolean; createdAt: string; sessions: number };

/** Your own account: name, password, and where you're logged in. */
export default function SettingsPage() {
  const hasPhoto = useStore((s) => !!s.users[s.me]?.avatarUrl);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const load = () =>
    api<Account>('/auth/account')
      .then(setAccount)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => void load(), []);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-1 font-wide text-3xl font-extrabold tracking-tight">Profile & settings</h1>
        </div>
        {error && (
          <p role="alert" className="rounded-[8px] bg-over px-3 py-2 text-sm text-over-fg">
            {error}
          </p>
        )}
        {!account ? (
          !error && <div className="rounded-modal border border-line bg-surface p-10 text-center text-sm text-muted">Loading…</div>
        ) : (
          <>
            <Section icon={UserRound} title="Profile">
              <div className="flex items-center gap-4">
                <AvatarUploader size="lg" />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{account.user.name}</div>
                  <div className="truncate text-sm text-muted">{account.user.email}</div>
                  <div className="text-xs text-muted">
                    Member since {format(parseISO(account.createdAt), 'MMMM d, yyyy')}
                    {account.usesGoogle && ' · signs in with Google'}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                    <span>Tap the camera to {hasPhoto ? 'change' : 'add'} your photo.</span>
                    <RemovePhotoButton />
                  </div>
                </div>
              </div>
              <NameForm current={account.user.name} onSaved={load} />
            </Section>

            <Section icon={KeyRound} title={account.hasPassword ? 'Change password' : 'Set a password'}>
              <PasswordForm hasPassword={account.hasPassword} onSaved={load} />
            </Section>

            <Section icon={MonitorX} title="Where you’re logged in">
              <LogoutEverywhere sessions={account.sessions} />
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof UserRound; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-modal border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Icon size={18} className="text-muted" /> {title}
      </h2>
      {children}
    </section>
  );
}

function NameForm({ current, onSaved }: { current: string; onSaved: () => void }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setName(current), [current]);
  const changed = name.trim() !== current;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Use at least 2 characters.');
    setBusy(true);
    setError('');
    try {
      const { user } = await api<{ user: User }>('/auth/account', 'PATCH', { name: name.trim() });
      useStore.setState((s) => ({ users: { ...s.users, [user.id]: { ...s.users[user.id], ...user } } }));
      toast('Name updated');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor="settings-name" className="text-sm font-semibold">
        Name
      </label>
      <div className="flex gap-2">
        <input
          id="settings-name"
          className="input min-w-0 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
        />
        <button className="btn-primary" disabled={!changed || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className={error ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>
        {error || 'This is how you appear to your team on cards, comments and activity.'}
      </p>
    </form>
  );
}

function PasswordForm({ hasPassword, onSaved }: { hasPassword: boolean; onSaved: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasPassword && !current) return setError('Enter your current password.');
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    setError('');
    try {
      const r = await api<{ loggedOutElsewhere: number }>('/auth/password', 'POST', {
        currentPassword: hasPassword ? current : undefined,
        newPassword: next,
      });
      toast(
        hasPassword
          ? `Password changed.${r.loggedOutElsewhere ? ` Logged out on ${r.loggedOutElsewhere} other device${r.loggedOutElsewhere === 1 ? '' : 's'}.` : ''}`
          : 'Password set. You can now log in with your email and this password too.',
      );
      setCurrent('');
      setNext('');
      setConfirm('');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {!hasPassword && (
        <p className="text-sm text-muted">You sign in with Google. Set a password if you also want to log in with your email.</p>
      )}
      {hasPassword && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw-current" className="text-sm font-semibold">
            Current password
          </label>
          <input
            id="pw-current"
            type={type}
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw-new" className="text-sm font-semibold">
            New password
          </label>
          <input
            id="pw-new"
            type={type}
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw-confirm" className="text-sm font-semibold">
            Type it again
          </label>
          <input
            id="pw-confirm"
            type={type}
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-[8px] bg-over px-3 py-2 text-sm text-over-fg">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />} {show ? 'Hide passwords' : 'Show passwords'}
        </button>
        <button className="btn-cta" disabled={busy}>
          {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
        </button>
      </div>
      {hasPassword && (
        <p className="text-xs text-muted">Changing it logs you out on your other phones and computers. You stay logged in here.</p>
      )}
    </form>
  );
}

function LogoutEverywhere({ sessions }: { sessions: number }) {
  const logoutEverywhere = useStore((s) => s.logoutEverywhere);
  const navigate = useNavigate();
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        You’re logged in on <b className="text-ink">{sessions}</b> {sessions === 1 ? 'device' : 'devices'} (including this one). If you used
        a shared or lab computer, log out everywhere.
      </p>
      {sure ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Log out on every device, including this one?</span>
          <button
            className="btn-danger"
            onClick={async () => {
              await logoutEverywhere();
              navigate('/login');
            }}
          >
            Yes, log out everywhere
          </button>
          <button className="btn-ghost" onClick={() => setSure(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn-ghost self-start" onClick={() => setSure(true)}>
          <MonitorX size={15} /> Log out on every device
        </button>
      )}
    </div>
  );
}
