// Self-test for the pure logic modules (formatter + repo-url parsing).
// Bundled with esbuild and run in Node via `npm test` — no test-runner
// dependency required.
import {
  formatSize,
  getWarningLevel,
  formatRelativeTime,
} from '../src/shared/formatter';
import { parseRepoFromUrl, repoKey } from '../src/shared/repo-url';

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL ${label}: got ${a}, expected ${e}`);
  }
}

// --- formatSize (binary) ---
eq(formatSize(0, 'binary'), '0 KiB', 'binary 0');
eq(formatSize(512, 'binary'), '512 KiB', 'binary 512KB');
eq(formatSize(1024, 'binary'), '1.0 MiB', 'binary 1MiB');
eq(formatSize(994918, 'binary'), '971.6 MiB', 'binary 971.6MiB');
eq(formatSize(2_000_000, 'binary'), '1.91 GiB', 'binary ~1.9GiB');

// --- formatSize (decimal, bytes-accurate) ---
eq(formatSize(500000, 'decimal'), '512.0 MB', 'decimal 500000KB');
eq(formatSize(994918, 'decimal'), '1.02 GB', 'decimal ~1GB');

// --- getWarningLevel (threshold interpreted in MiB) ---
eq(getWarningLevel(512000, 500), 'warning', 'warn at threshold');
eq(getWarningLevel(499 * 1024, 500), 'none', 'below threshold');
eq(getWarningLevel(1000 * 1024, 500), 'danger', 'danger at 2x');
eq(getWarningLevel(100000, 0), 'none', 'threshold 0 disables');

// --- formatRelativeTime ---
eq(formatRelativeTime(1000, 1000), 'just now', 'reltime now');
eq(formatRelativeTime(0, 5 * 60 * 1000), '5 min ago', 'reltime 5min');
eq(formatRelativeTime(0, 3 * 3600 * 1000), '3 h ago', 'reltime 3h');

// --- parseRepoFromUrl ---
eq(parseRepoFromUrl('https://github.com/facebook/react'), { owner: 'facebook', repo: 'react' }, 'repo basic');
eq(parseRepoFromUrl('https://github.com/facebook/react/tree/main/x'), { owner: 'facebook', repo: 'react' }, 'repo subpage');
eq(parseRepoFromUrl('https://github.com/facebook/react.git'), { owner: 'facebook', repo: 'react' }, 'repo .git');
eq(parseRepoFromUrl('https://github.com/settings/profile'), null, 'reserved settings');
eq(parseRepoFromUrl('https://github.com/orgs/nodejs'), null, 'reserved orgs');
eq(parseRepoFromUrl('https://github.com/marketplace'), null, 'reserved marketplace');
eq(parseRepoFromUrl('https://github.com/facebook'), null, 'profile only');
eq(parseRepoFromUrl('https://github.com/'), null, 'root');
eq(parseRepoFromUrl('https://github.com/topics/javascript'), null, 'topics');
eq(parseRepoFromUrl('https://gist.github.com/a/b'), null, 'gist host');
eq(parseRepoFromUrl('https://github.com/foo/sponsors'), null, 'reserved repo name');

// --- repoKey ---
eq(repoKey('Facebook', 'React'), 'facebook/react', 'repoKey lowercases');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
