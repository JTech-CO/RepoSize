import { defineManifest } from '@crxjs/vite-plugin';

// Extension manifest (single source of truth). Least privilege: only `storage`
// and `activeTab`; host access limited to the GitHub API. Icons come from
// public/icons (copied verbatim by Vite) and are referenced by their output path.
export default defineManifest({
  manifest_version: 3,
  name: 'RepoSize',
  version: '1.0.1',
  description:
    'Show accurate repository size on GitHub before you download or clone.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'RepoSize',
    default_icon: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  options_page: 'src/options/index.html',
  permissions: ['storage', 'activeTab'],
  host_permissions: ['https://api.github.com/*'],
  content_scripts: [
    {
      // Match every github.com page so the badge survives client-side nav; the
      // script no-ops unless the URL resolves to an owner/repo page.
      matches: ['https://github.com/*'],
      js: ['src/content/index.ts'],
      css: ['src/content/styles.css'],
      run_at: 'document_idle',
    },
  ],
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
});
