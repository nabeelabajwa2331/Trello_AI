import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { env } from './env.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what = 'That item') => new HttpError(404, `${what} doesn't exist or was deleted.`);
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, msg);

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

/** Public address of the site for links in emails. */
export const appOrigin = (req: Request) => env.appUrl || req.get('origin') || `${req.protocol}://${req.get('host')}`;

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input.' });
  }
  // Errors from express.json(): broken JSON or a body that is too large.
  const type = (err as { type?: string })?.type;
  if (type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (type === 'entity.too.large') return res.status(413).json({ error: 'That is too much text to save at once.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
}
