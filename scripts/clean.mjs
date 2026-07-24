// Remove dist/ before a fresh build. Doing it as a separate step (instead of
// Vite's emptyOutDir) avoids a native crash on Windows + Node 25.

import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
console.log('Cleaned dist/');
