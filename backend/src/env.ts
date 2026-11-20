import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** OAuth Client ID from Google Cloud Console. Empty = "Continue with Google" is hidden. */
  googleClientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
  /** Site admins: comma-separated emails. Only confirmed accounts with these emails get the admin panel. */
  adminEmails: new Set(
    // ADMIN_EMAIL (no S) is accepted too, because it's an easy name to get wrong.
    [process.env.ADMIN_EMAILS, process.env.ADMIN_EMAIL].filter(Boolean).join(',')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
  /**
   * Built-in site admin that logs in with a password set here (not a personal Gmail).
   * Created/updated on every start. Google sign-in and "forgot password" are disabled for it.
   */
  siteAdmin: {
    email: (process.env.SITE_ADMIN_EMAIL ?? '').trim().toLowerCase(),
    password: process.env.SITE_ADMIN_PASSWORD ?? '',
    name: (process.env.SITE_ADMIN_NAME ?? 'Site Admin').trim() || 'Site Admin',
  },
  /** Brevo (brevo.com) API key: sends email over HTTPS. Use it if your host blocks SMTP. Takes priority over SMTP. */
  brevoKey: (process.env.BREVO_API_KEY ?? '').trim(),
  /**
   * Email confirmation (off by default). When on, signup sends a confirmation link and email invites can
   * only be accepted after confirming. Off suits demo/test accounts with made-up addresses.
   */
  requireEmailConfirmation: (process.env.REQUIRE_EMAIL_CONFIRMATION ?? '').trim().toLowerCase() === 'true',
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
  isTest: process.env.NODE_ENV === 'test',
};

if (env.isProd && env.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('Set JWT_SECRET in production.');
}
