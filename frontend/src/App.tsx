import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import Workspace from './pages/Workspace';
import BoardPage from './pages/BoardPage';
import NotFound from './pages/NotFound';
import { useStore } from './store/useStore';
import { useRealtimeSync } from './hooks/useRealtimeSync';

function RequireAuth() {
  const session = useStore((s) => s.session);
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export default function App() {
  useRealtimeSync();
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route element={<RequireAuth />}>
          <Route path="/boards" element={<Workspace />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
          <Route path="/b/:boardId/c/:cardId" element={<BoardPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-ink !text-surface !border-0 !rounded-[12px] !font-sans',
            description: '!text-surface/70',
            actionButton: '!bg-accent !text-on-accent !font-semibold',
          },
        }}
      />
    </>
  );
}
