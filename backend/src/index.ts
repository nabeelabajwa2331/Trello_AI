import { env } from './env.js';
import { createAppServer } from './app.js';

createAppServer().listen(env.port, () => {
  console.log(`Crewboard API on http://localhost:${env.port}`);
});
