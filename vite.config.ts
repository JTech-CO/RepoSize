import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

// RepoSize — Chrome Extension (Manifest V3) build configuration.
// @crxjs handles the multi-entry wiring (background service worker, content
// script, popup, options) declared in `src/manifest.config.ts`.
//
// Note: dist/ is removed before each build by `scripts/clean.mjs` (see the
// build scripts in package.json). We keep `emptyOutDir: false` so Vite never
// tries to clear an existing dist mid-build — that path can crash the native
// esbuild subprocess on Windows + Node 25.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    // dist/ is removed beforehand by `scripts/clean.mjs` (see package.json).
    // Letting Vite/@crxjs empty an existing dist mid-build can crash natively
    // on Windows, so we opt out of its in-build cleanup here.
    emptyOutDir: false,
    // Keep the content-script bundle lean (whitepaper target: < 15 KB).
    chunkSizeWarningLimit: 100,
  },
  server: {
    port: 5173,
    strictPort: true,
    // HMR websocket for the extension dev server.
    hmr: { port: 5173 },
  },
});
