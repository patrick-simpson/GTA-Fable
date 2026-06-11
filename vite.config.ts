import { defineConfig } from 'vite';

// Relative base so the same build works at both
// https://<username>.github.io/GTA-Fable/ and a custom domain root
// (e.g. https://gtav.doofus.live/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
  },
});
