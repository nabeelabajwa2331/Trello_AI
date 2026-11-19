import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin requests in development, so the httpOnly auth cookie just works.
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
