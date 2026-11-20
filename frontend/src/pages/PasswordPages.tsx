import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, MailCheck } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useStore } from '../store/useStore';
import { api, errorMessage } from '../lib/api';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-4 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 py-10">{children}</div>
    </div>
  );
}

const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-[8px] bg-over px-3 py-2 text-sm text-over-fg">
    {children}
  </p>
);

/** Step 1: ask for the email. The answer never says whether an account exists. */
export function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  // Is email sending switched on? If not, a reset link can't arrive, so say how to get back in instead.
  const [emailOn, setEmailOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ emailEnabled?: boolean }>('/auth/config')
      .then((c) => setEmailOn(!!c.emailEnabled))
      .catch(() => setEmailOn(true));
  }, []);

  if (emailOn === false) {
    return (
      <Shell>
        <span className="grid h-12 w-12 place-items-center rounded-full border border-ink bg-accent text-on-accent">
          <KeyRound size={22} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-wide text-3xl font-extrabold tracking-tight">Forgot your password?</h1>
          <p className="text-muted">
            This site doesn’t send emails yet, so a reset link can’t reach you. <b className="text-ink">Ask your admin</b> to set a new password for you from the
            admin panel.
          </p>
          <p className="text-muted">
            Then log in with it and choose your own in <b className="text-ink">Profile & settings → Change password</b>.
          </p>
          <p className="text-sm text-muted">If you signed up with Google, just use “Continue with Google”; you don’t need a password.</p>
        </div>
        <Link to="/login" className="btn-cta self-start">
          Back to log in
        </Link>
      </Shell>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setError('Enter the email you signed up with, like name@university.edu.');
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot', 'POST', { email: v });
      setSentTo(v);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <Shell>
        <span className="grid h-12 w-12 place-items-center rounded-full border border-ink bg-accent text-on-accent">
          <MailCheck size={22} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-wide text-3xl font-extrabold tracking-tight">Check your email</h1>
          <p className="text-muted">
            If <b className="text-ink">{sentTo}</b> has a Crewboard account, we've sent it a link to choose a new password. The link works once and expires in 1 hour.
          </p>
          <p className="text-sm text-muted">Nothing after a few minutes? Check your spam folder, or try again.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/login" className="btn-cta">Back to log in</Link>
          <button className="btn-ghost" onClick={() => setSentTo('')}>Use a different email</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <h1 className="font-wide text-3xl font-extrabold tracking-tight">Forgot your password?</h1>
        <p className="text-muted">Enter your email and we'll send you a link to choose a new one.</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="forgot-email" className="text-sm font-semibold">Email</label>
          <input id="forgot-email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-cta py-3 text-[15px]" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <Link to="/login" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft size={15} /> Back to log in
      </Link>
    </Shell>
  );
}

/** Opened from the "Confirm your email" message. Works whether or not this browser is logged in. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const confirmEmail = useStore((s) => s.confirmEmail);
  const loggedIn = useStore((s) => s.status === 'ready');
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError('This confirmation link is incomplete. Copy the whole link from the email.');
      return setState('failed');
    }
    confirmEmail(token)
      .then(() => setState('done'))
      .catch((e) => {
        setError(errorMessage(e));
        setState('failed');
      });
  }, [token, confirmEmail]);

  return (
    <Shell>
      {state === 'working' && <p className="text-muted">Confirming your email…</p>}
      {state === 'done' && (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-full border border-ink bg-accent text-on-accent">
            <MailCheck size={22} />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="font-wide text-3xl font-extrabold tracking-tight">Email confirmed</h1>
            <p className="text-muted">Teammates can now invite you to their boards, and you can accept the invitations waiting for you.</p>
          </div>
          <Link to={loggedIn ? '/boards' : '/login'} className="btn-cta self-start">{loggedIn ? 'Go to your boards' : 'Log in'}</Link>
        </>
      )}
      {state === 'failed' && (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="font-wide text-3xl font-extrabold tracking-tight">This link doesn't work anymore</h1>
            <p className="text-muted">{error}</p>
          </div>
          <Link to={loggedIn ? '/boards' : '/login'} className="btn-cta self-start">{loggedIn ? 'Go to your boards' : 'Log in'}</Link>
          {loggedIn && <p className="text-sm text-muted">You can send a new link from the yellow banner at the top of your boards.</p>}
        </>
      )}
    </Shell>
  );
}

/** Step 2: opened from the emailed link. Saving the new password also logs you in. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const resetPassword = useStore((s) => s.resetPassword);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(!token);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError("The two passwords don't match.");
    setError('');
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/boards', { replace: true });
    } catch (err) {
      const msg = errorMessage(err);
      if (/expired|already used|incomplete/i.test(msg)) setExpired(true);
      else setError(msg);
      setBusy(false);
    }
  };

  if (expired) {
    return (
      <Shell>
        <div className="flex flex-col gap-2">
          <h1 className="font-wide text-3xl font-extrabold tracking-tight">This link doesn't work anymore</h1>
          <p className="text-muted">Reset links work once and expire after 1 hour. Ask for a new one and use the newest email.</p>
        </div>
        <Link to="/forgot-password" className="btn-cta self-start">Send a new link</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <h1 className="font-wide text-3xl font-extrabold tracking-tight">Choose a new password</h1>
        <p className="text-muted">After saving, you'll be logged in.</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-password" className="text-sm font-semibold">New password</label>
          <div className="relative">
            <input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" className="input pr-10" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <span className="text-xs text-muted">At least 8 characters.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-password" className="text-sm font-semibold">Type it again</label>
          <input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-cta py-3 text-[15px]" disabled={busy}>{busy ? 'Saving…' : 'Save and log in'}</button>
      </form>
    </Shell>
  );
}
