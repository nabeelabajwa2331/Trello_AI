import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/* Minimal types for Google Identity Services (https://accounts.google.com/gsi/client). */
type CredentialResponse = { credential: string };
interface GoogleId {
  initialize: (o: { client_id: string; callback: (r: CredentialResponse) => void; ux_mode?: 'popup'; auto_select?: boolean; context?: 'signin' | 'signup'; itp_support?: boolean }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
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

export function googleSignOut() {
  window.google?.accounts.id.disableAutoSelect();
}

/**
 * Google's official "Continue with Google" button. Renders nothing when the server has no Client ID,
 * so email-and-password sign-in keeps working on its own.
 */
export function GoogleButton({ mode, onCredential, disabled }: { mode: 'login' | 'signup'; onCredential: (credential: string) => void; disabled?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [state, setState] = useState<'loading' | 'ready' | 'off' | 'failed'>('loading');

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
      const gid = window.google?.accounts.id;
      if (cancelled || !gid || !holder.current) return;
      gid.initialize({
        client_id: clientId,
        callback: (r) => callback.current(r.credential),
        ux_mode: 'popup',
        auto_select: false,
        context: mode === 'signup' ? 'signup' : 'signin',
        itp_support: true,
      });
      const dark = document.documentElement.classList.contains('dark');
      gid.renderButton(holder.current, {
        type: 'standard',
        theme: dark ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width: Math.min(400, Math.round(holder.current.getBoundingClientRect().width) || 320),
      });
      setState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (state === 'off') return null;
  return (
    <div className="flex flex-col gap-2">
      {/* Fixed height so the page doesn't jump while Google's button loads */}
      <div className={disabled ? 'pointer-events-none opacity-60' : undefined} style={{ minHeight: 44 }}>
        <div ref={holder} className="w-full" />
        {state === 'loading' && <div className="h-[44px] w-full rounded-[8px] border border-line bg-column" aria-hidden="true" />}
      </div>
      {state === 'failed' && <p className="text-xs text-muted">Google sign-in didn't load. Check your connection, or use your email below.</p>}
      <div className="mt-1 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
