// Remove the build output directory before a fresh build.
//
// @crxjs/vite-plugin (2.7.x) + Vite 6 can crash natively on Windows when its
// `emptyOutDir` step overwrites an existing `dist/` mid-build. Deleting the
// directory in a separate step beforehand avoids that path entirely, so
// `npm run build` is reliable on repeat runs.

import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
console.log('Cleaned dist/');
