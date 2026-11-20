import { useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import Workspace from './pages/Workspace';
import BoardPage from './pages/BoardPage';
import JoinPage from './pages/JoinPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/PasswordPages';
import NotFound from './pages/NotFound';
import { LogoMark } from './components/ui/Logo';
import { WelcomeSplash } from './components/WelcomeSplash';
import { useStore } from './store/useStore';

/** Shown while the app connects. */
function Loading() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, []);
  const waking = seconds >= 3;
  // Fills toward 95% over about a minute, then waits there; it never claims to be done before it is.
  const progress = Math.min(95, Math.round((seconds / 60) * 95));

  return (
    <div className="grid min-h-screen place-items-center px-4" aria-busy="true">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <LogoMark className={waking ? 'h-12 w-12' : 'h-10 w-10 opacity-60'} />
        {waking ? (
          <>
            <div className="flex flex-col gap-2" role="status" aria-live="polite">
              <h1 className="font-wide text-2xl font-extrabold tracking-tight">Waking up the server…</h1>
              <p className="text-muted">
                Crewboard runs on a free server that naps when nobody is using it. It usually takes{' '}
                <b className="text-ink">30–60 seconds</b> to start. This page opens by itself; you don’t need to refresh.
              </p>
            </div>
            <div className="w-full">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-column"
                role="progressbar"
                aria-label="Starting the server"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 font-mono text-xs tabular-nums text-muted">
                {seconds} s{seconds > 75 ? ' · taking longer than usual, still trying' : ''}
              </p>
            </div>
          </>
        ) : (
          <span className="sr-only">Loading</span>
        )}
      </div>
    </div>
  );
}

function RequireAuth() {
  const status = useStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/signup pages bounce signed-in users to their boards. */
function GuestOnly({ children }: { children: JSX.Element }) {
  const status = useStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'ready') return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/boards'} replace />;
  return children;
}

export default function App() {
  const init = useStore((s) => s.init);
  useEffect(() => void init(), [init]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <GuestOnly>
              <AuthPage mode="login" />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <AuthPage mode="signup" />
            </GuestOnly>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/boards" element={<Workspace />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
          <Route path="/b/:boardId/c/:cardId" element={<BoardPage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <WelcomeSplash />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-ink !text-surface !border-0 !rounded-[10px] !font-sans',
            description: '!text-surface/70',
            actionButton: '!bg-accent !text-on-accent !font-semibold',
          },
        }}
      />
    </>
  );
}
