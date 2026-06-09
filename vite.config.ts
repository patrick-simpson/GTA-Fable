import { defineConfig } from 'vite';

// The site is served from the root of the custom domain (gtav.doofus.live),
// so assets must resolve from /.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
  },
});
