import 'dotenv/config';

/** Only the site's own address: "https://x.vercel.app/join/abc" becomes "https://x.vercel.app". */
function siteOrigin(value: string) {
  const v = value.trim();
  if (!v) return '';
  try {
    return new URL(v.includes('://') ? v : `https://${v}`).origin;
  } catch {
    return v.replace(/\/+$/, '');
  }
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  /** Websites allowed to call the API / live updates from the browser (comma-separated), e.g. the Vercel address. */
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  /** Shared with the Vercel proxy (frontend/api/proxy.js). Lets it pass on the visitor's real IP address. */
  proxySecret: (process.env.PROXY_SECRET ?? '').trim(),
  /** OAuth Client ID from Google Cloud Console. Empty = "Continue with Google" is hidden. */
  googleClientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
  /** Site admins: comma-separated emails. Only confirmed accounts with these emails get the admin panel. */
  adminEmails: new Set(
    // ADMIN_EMAIL (no S) is accepted too, because it's an easy name to get wrong.
    [process.env.ADMIN_EMAILS, process.env.ADMIN_EMAIL]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
  /** Built-in site admin that logs in with a password set here (not a personal Gmail). */
  siteAdmin: {
    email: (process.env.SITE_ADMIN_EMAIL || 'crewadmin@gmail.com').trim().toLowerCase(),
    password: process.env.SITE_ADMIN_PASSWORD ?? '',
    name: (process.env.SITE_ADMIN_NAME ?? 'Admin').trim() || 'Admin',
  },
  /** Brevo API key: email over HTTPS, for hosts that block SMTP. Takes priority over SMTP. */
  brevoKey: (process.env.BREVO_API_KEY ?? '').trim(),
  /** Email confirmation (off by default). */
  requireEmailConfirmation: (process.env.REQUIRE_EMAIL_CONFIRMATION ?? '').trim().toLowerCase() === 'true',
  /** Public address for links and previews: APP_URL, else Render's RENDER_EXTERNAL_URL, else the request's own address. */
  appUrl: siteOrigin(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || ''),
  appUrlSource: process.env.APP_URL ? 'APP_URL' : process.env.RENDER_EXTERNAL_URL ? 'Render' : null,
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
