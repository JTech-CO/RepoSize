// Reliable production build with automatic retry. Node 25 on Windows sporadically
// crashes the native build tooling (exit 0xC0000409); this reruns the Vite build
// on that crash only. Real build errors surface immediately. Prefer Node LTS.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const NATIVE_CRASH = new Set([-1073740791, 3221226505]); // 0xC0000409 signed/unsigned
const MAX_ATTEMPTS = Number(process.env.RS_BUILD_ATTEMPTS) || 8;
const VITE_BIN = 'node_modules/vite/bin/vite.js';

if (!existsSync(VITE_BIN)) {
  console.error(`Cannot find ${VITE_BIN} — run \`npm install\` first.`);
  process.exit(1);
}

function cleanDist() {
  for (let i = 0; i < 3; i++) {
    try {
      rmSync('dist', { recursive: true, force: true });
      return;
    } catch {
      /* retry a couple of times, then give up (best effort) */
    }
  }
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  cleanDist();
  const res = spawnSync(process.execPath, [VITE_BIN, 'build'], { stdio: 'inherit' });

  if (res.status === 0) {
    process.exit(0);
  }

  const crashed = res.status === null || NATIVE_CRASH.has(res.status);
  if (!crashed) {
    // A genuine build failure — do not spin on it.
    console.error(`\n[build] Vite build failed (exit ${res.status}).`);
    process.exit(res.status ?? 1);
  }

  console.error(
    `\n[build] Native runtime crash on attempt ${attempt}/${MAX_ATTEMPTS} ` +
      `(Node 25 / Windows). Retrying…`,
  );
}

console.error(
  `[build] Still crashing after ${MAX_ATTEMPTS} attempts. ` +
    `Consider switching to a Node LTS release (22 or 24).`,
);
process.exit(1);
