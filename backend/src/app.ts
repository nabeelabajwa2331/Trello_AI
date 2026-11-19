import { createServer } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env.js';
import { authRouter } from './auth.js';
import { api } from './routes.js';
import { errorHandler } from './http.js';
import { initRealtime } from './realtime.js';

/** Builds the HTTP + Socket.IO server without listening, so tests can start it on any port. */
export function createAppServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  app.use(errorHandler);

  const server = createServer(app);
  initRealtime(server);
  return server;
}
