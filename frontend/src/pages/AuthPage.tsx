import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useStore } from '../store/useStore';
import { errorMessage } from '../lib/api';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'form', string>>;

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const login = useStore((s) => s.login);
  const signup = useStore((s) => s.signup);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const isSignup = mode === 'signup';
  // Local development only: /login?demo=1 fills in the seeded demo account. Never active on the live site.
  const isDemo = import.meta.env.DEV && params.get('demo') === '1';

  const [name, setName] = useState('');
  const [email, setEmail] = useState(isDemo ? 'demo@crewboard.app' : '');
  const [password, setPassword] = useState(isDemo ? 'password123' : '');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (isSignup && name.trim().length < 2) e.name = 'Enter your name so teammates know who you are.';
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter an email like name@university.edu.';
    if (isSignup ? password.length < 8 : !password) e.password = isSignup ? 'Use at least 8 characters.' : 'Enter your password.';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isSignup) await signup(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/boards', { replace: true });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="font-wide text-3xl font-extrabold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="text-muted">{isSignup ? 'Free for teams up to 10. Takes 30 seconds.' : 'Log in to see your boards.'}</p>
          </div>
          {isDemo && !isSignup && (
            <p className="rounded-[8px] border border-line bg-accent-soft px-3 py-2 text-sm">
              Demo account filled in. To watch live updates, log in as <b>sara@example.edu</b> (same password) in a private window.
            </p>
          )}
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            {isSignup && (
              <Field id="name" label="Full name" error={errors.name}>
                <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby="name-err" />
              </Field>
            )}
            <Field id="email" label="Email" error={errors.email}>
              <input id="email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby="email-err" />
            </Field>
            <Field id="password" label="Password" error={errors.password}>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input pr-10"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby="password-err"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {errors.form && (
              <p role="alert" className="rounded-[8px] bg-over px-3 py-2 text-sm text-over-fg">
                {errors.form}
              </p>
            )}
            <button className="btn-cta mt-2 py-3 text-[15px]" disabled={busy}>
              {busy ? 'One moment…' : isSignup ? 'Create account' : 'Log in'}
            </button>
          </form>
          <p className="text-sm text-muted">
            {isSignup ? 'Already have an account? ' : 'New to Crewboard? '}
            <Link to={isSignup ? '/login' : '/signup'} state={location.state} className="font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4">
              {isSignup ? 'Log in' : 'Create an account'}
            </Link>
          </p>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-surface lg:flex lg:flex-col lg:justify-end">
        <div className="relative flex max-w-md flex-col gap-6">
          <div className="flex items-end gap-3">
            {[18, 11, 14].map((h, i) => (
              <div key={i} className="w-14 rounded-md bg-accent" style={{ height: h * 8 }} />
            ))}
          </div>
          <p className="font-display font-wide text-3xl font-bold leading-tight">Every task gets a card. Every card gets a name and a date.</p>
          <p className="text-surface/60">That's the whole idea.</p>
        </div>
      </aside>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
