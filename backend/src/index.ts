import { env } from './env.js';
import { createAppServer } from './app.js';
import { ensureSiteAdmin } from './auth.js';

await ensureSiteAdmin().catch((e) => console.error('Could not set up the site admin account:', e));

createAppServer().listen(env.port, () => {
  console.log(`Crewboard API on http://localhost:${env.port}`);
});
