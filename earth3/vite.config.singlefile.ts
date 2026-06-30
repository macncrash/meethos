// Produces ONE self-contained HTML file (all JS + CSS inlined) for sharing/testing
// without a build step — `bunx vite build -c vite.config.singlefile.ts` → dist-single/
// index.html, which runs by double-clicking (the unified game; ?legacy still works).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist-single',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    // single entry = index.html (the unified game); no zoom.html, no code-splitting.
    // The inlined entry stays a deferred `type=module` script: DOM-safe (runs after
    // parse) and runs from file:// by double-click in any current browser.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
