import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** OAuth Client ID from Google Cloud Console. Empty = "Continue with Google" is hidden. */
  googleClientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
  /** Public address of the site, used in emailed links. Falls back to the request's own address. */
  appUrl: (process.env.APP_URL ?? '').replace(/\/$/, ''),
  /** Outgoing email (password resets). Empty SMTP_HOST = links are printed to the server log instead. */
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? 'Crewboard <no-reply@crewboard.app>',
  },
  isProd: process.env.NODE_ENV === 'production',
};

if (env.isProd && env.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('Set JWT_SECRET in production.');
}
