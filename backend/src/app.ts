import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env.js';
import { authRouter } from './auth.js';
import { api } from './routes.js';
import { admin } from './admin.js';
import { appOrigin, errorHandler } from './http.js';
import { initRealtime } from './realtime.js';

/** The built React app. In production the API serves it too, so everything is on one domain. */
const FRONTEND_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');

/** Builds the HTTP + Socket.IO server without listening, so tests can start it on any port. */
export function createAppServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render sits behind a proxy
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/admin', admin);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
    // Hashed asset files can be cached for a long time; index.html must always be fresh.
    app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(FRONTEND_DIST, { index: false }));
    // Any other page (/boards, /b/123…) is handled by React Router.
    // __APP_URL__ in index.html becomes the live address, so shared links get a correct preview card.
    const html = fs.readFileSync(path.join(FRONTEND_DIST, 'index.html'), 'utf8');
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(html.replaceAll('__APP_URL__', appOrigin(req)));
    });
  }

  app.use(errorHandler);

  const server = createServer(app);
  initRealtime(server);
  return server;
}
