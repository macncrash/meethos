import { defineConfig } from 'vite';

// meethos / earth3 — single-page Three.js game. No special headers needed yet
// (the simulation runs on the main thread). When we move heavy regimes onto a
// SharedArrayBuffer worker like ethersim, add the COOP/COEP headers here.
export default defineConfig({
  server: { port: 5174, open: false },
  build: { target: 'es2022', sourcemap: true },
});
