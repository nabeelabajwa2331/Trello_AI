export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Called when a logged-in request comes back 401: the session expired or was ended elsewhere. */
let onSessionEnded: (() => void) | null = null;
export const setSessionEndedHandler = (fn: () => void) => void (onSessionEnded = fn);

// Wrong passwords etc. also answer 401 on these, and they don't mean "your session ended".
const AUTH_FORMS = [
  '/auth/login',
  '/auth/signup',
  '/auth/google',
  '/auth/forgot',
  '/auth/reset',
  '/auth/verify',
  '/auth/me',
  '/auth/logout',
  '/bootstrap',
];

export async function api<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !AUTH_FORMS.some((p) => path === p || path.startsWith(p + '/'))) onSessionEnded?.();
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
