import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// meethos / earth3 — the game at index.html, plus the Phase 1 floating-origin
// proof at zoom.html. When heavy regimes move onto a SharedArrayBuffer worker
// like ethersim, add the COOP/COEP headers here.
export default defineConfig({
  server: { port: 5174, open: false },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        zoom: resolve(__dirname, 'zoom.html'),
      },
    },
  },
});
