import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import Workspace from './pages/Workspace';
import BoardPage from './pages/BoardPage';
import JoinPage from './pages/JoinPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import NotFound from './pages/NotFound';
import { LogoMark } from './components/ui/Logo';
import { useStore } from './store/useStore';

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center" aria-busy="true" aria-label="Loading">
      <LogoMark className="h-10 w-10 opacity-60" />
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
        <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><AuthPage mode="signup" /></GuestOnly>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/boards" element={<Workspace />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
          <Route path="/b/:boardId/c/:cardId" element={<BoardPage />} />
          <Route path="/join/:token" element={<JoinPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
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
