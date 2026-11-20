import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';

/* Minimal types for Google Identity Services (https://accounts.google.com/gsi/client). */
type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
interface GoogleAccounts {
  id: { disableAutoSelect: () => void };
  oauth2: {
    initTokenClient: (o: {
      client_id: string;
      scope: string;
      callback: (r: TokenResponse) => void;
      error_callback?: (e: { type: 'popup_closed' | 'popup_failed_to_open' | 'unknown' }) => void;
    }) => TokenClient;
  };
}
declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

let configPromise: Promise<string | null> | null = null;
let scriptPromise: Promise<void> | null = null;

/** The Client ID comes from the server, so it is configured in one place (GOOGLE_CLIENT_ID). */
const getClientId = () =>
  (configPromise ??= api<{ googleClientId: string | null }>('/auth/config')
    .then((c) => c.googleClientId)
    .catch(() => {
      configPromise = null;
      return null;
    }));

const loadScript = () =>
  (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not load.'));
    };
    document.head.appendChild(s);
  }));

/** Google's "G" mark. Google's branding rules require it unchanged, in these four colours. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** "Continue with Google" in Crewboard's own style. */
export function GoogleButton({
  onAccessToken,
  onError,
  disabled,
}: {
  onAccessToken: (token: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const client = useRef<TokenClient | null>(null);
  const handlers = useRef({ onAccessToken, onError });
  handlers.current = { onAccessToken, onError };
  const [state, setState] = useState<'loading' | 'ready' | 'off' | 'failed'>('loading');
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clientId = await getClientId();
      if (cancelled) return;
      if (!clientId) return setState('off');
      try {
        await loadScript();
      } catch {
        if (!cancelled) setState('failed');
        return;
      }
      const oauth2 = window.google?.accounts.oauth2;
      if (cancelled || !oauth2) return;
      client.current = oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: (r) => {
          setWaiting(false);
          if (r.access_token) handlers.current.onAccessToken(r.access_token);
          else if (r.error !== 'access_denied') handlers.current.onError(r.error_description || "Google sign-in didn't finish. Try again.");
        },
        error_callback: (e) => {
          setWaiting(false);
          if (e.type === 'popup_failed_to_open')
            handlers.current.onError('Your browser blocked the Google window. Allow pop-ups for this site and try again.');
          // popup_closed: the person closed it on purpose, so say nothing.
        },
      });
      setState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'off') return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          if (!client.current) return;
          setWaiting(true);
          client.current.requestAccessToken({ prompt: 'select_account' });
        }}
        disabled={disabled || state !== 'ready' || waiting}
        className={clsx(
          'btn h-11 w-full border border-ink bg-surface text-[15px] text-ink',
          'hover:bg-accent-soft active:bg-accent/60',
          'disabled:cursor-default disabled:opacity-60',
        )}
      >
        <GoogleG />
        <span>{waiting ? 'Waiting for Google…' : 'Continue with Google'}</span>
      </button>
      {state === 'failed' && (
        <p className="text-xs text-muted">Google sign-in didn't load. Check your connection, or use your email below.</p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
