import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogoMark } from '../components/ui/Logo';
import { useStore } from '../store/useStore';
import { errorMessage } from '../lib/api';

/** Opened from an invite link. Logged-out visitors are sent to log in first and come back here. */
export default function JoinPage() {
  const { token = '' } = useParams();
  const join = useStore((s) => s.joinByToken);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    join(token)
      .then((boardId) => navigate(`/b/${boardId}`, { replace: true }))
      .catch((e) => setError(errorMessage(e)));
  }, [token, join, navigate]);

  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <LogoMark className="h-10 w-10" />
        {error ? (
          <>
            <h1 className="text-2xl font-extrabold">Couldn't join the board</h1>
            <p className="text-muted">{error}</p>
            <Link to="/boards" className="btn-primary">
              Go to your boards
            </Link>
          </>
        ) : (
          <p className="text-muted">Joining the board…</p>
        )}
      </div>
    </div>
  );
}
