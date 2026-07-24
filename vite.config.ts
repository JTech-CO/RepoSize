import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

// RepoSize MV3 build. @crxjs wires the multi-entry manifest. The build scripts
// clean dist/ first and emptyOutDir is off — clearing an existing dist mid-build
// can crash the native esbuild subprocess on Windows + Node 25.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    emptyOutDir: false, // cleaned by build scripts; avoids a Node 25 native crash
    chunkSizeWarningLimit: 100,
  },
  server: {
    port: 5173,
    strictPort: true,
    // HMR websocket for the extension dev server.
    hmr: { port: 5173 },
  },
});
