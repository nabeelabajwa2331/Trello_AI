import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** OAuth Client ID from Google Cloud Console. Empty = "Continue with Google" is hidden. */
  googleClientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
  isProd: process.env.NODE_ENV === 'production',
};

if (env.isProd && env.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('Set JWT_SECRET in production.');
}
