import { defineConfig } from 'vite';

// base must match the GitHub repository name so assets resolve at
// https://<username>.github.io/GTA-Fable/
export default defineConfig({
  base: '/GTA-Fable/',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
  },
});
