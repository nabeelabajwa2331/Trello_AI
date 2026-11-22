/**
 * Vercel only: forwards /api/* to the backend on Render (vercel.json sends every /api request here).
 * The browser only ever talks to the Vercel address, so the login cookie stays a normal first-party cookie.
 * Settings in Vercel: BACKEND_URL (e.g. https://crewboard-zgwk.onrender.com) and PROXY_SECRET (same value as on Render).
 */
export const config = { runtime: 'edge' };

// Headers that belong to one connection and must not be passed on.
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'te', 'trailer'];

export default async function handler(request) {
  const backend = (process.env.BACKEND_URL ?? '').trim().replace(/\/$/, '');
  if (!backend) return json(500, 'BACKEND_URL is not set in Vercel → Settings → Environment Variables.');

  const url = new URL(request.url);
  // vercel.json passes the original path as ?__path=…; fall back to the URL itself.
  const path = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
  url.searchParams.delete('__path');
  const target = `${backend}/api/${path.replace(/^\/+/, '')}${url.searchParams.size ? `?${url.searchParams}` : ''}`;

  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  for (const h of [...headers.keys()]) if (h.startsWith('x-crewboard-')) headers.delete(h); // never trust these from the browser
  const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim();
  if (process.env.PROXY_SECRET && ip) {
    headers.set('x-crewboard-proxy', process.env.PROXY_SECRET);
    headers.set('x-crewboard-client-ip', ip);
  }
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');
  headers.set('accept-encoding', 'identity'); // Vercel compresses the answer itself

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
      // Vercel gives a proxy about 25 s to start answering; the app shows "Waking up the server" and retries on 503.
      signal: AbortSignal.timeout(22_000),
    });
  } catch {
    return json(503, 'The server is waking up. Try again in a few seconds.');
  }

  const out = new Headers(upstream.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

const json = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });
