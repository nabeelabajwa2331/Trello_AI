import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

/**
 * Website on Vercel: BACKEND_URL (the Render address) is set in Vercel's settings. Live updates then connect straight
 * to it, and the link-preview tags get the Vercel address at build time (on Render the server fills them in instead).
 */
const backendUrl = (process.env.BACKEND_URL ?? '').trim().replace(/\/$/, '');
const siteUrl = (
  process.env.PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
)
  .trim()
  .replace(/\/$/, '');

const fillSiteUrl = (): Plugin => ({
  name: 'fill-site-url',
  transformIndexHtml: (html) => (siteUrl ? html.replaceAll('__APP_URL__', siteUrl) : html),
});

export default defineConfig({
  plugins: [react(), fillSiteUrl()],
  define: backendUrl ? { 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(backendUrl) } : {},
  server: {
    port: 5173,
    // Same-origin requests in development, so the httpOnly auth cookie just works.
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
