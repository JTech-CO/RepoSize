import { defineManifest } from '@crxjs/vite-plugin';

// Single source of truth for the extension manifest.
//
// Design notes (see whitepaper §2.3, §7.1):
//  - Least privilege: only `storage` (settings + cache) and `activeTab`
//    (read the current tab's URL from the popup on user click).
//  - Host permission is limited to the GitHub REST API. The content script is
//    granted github.com access implicitly through its static `matches`.
//  - Icons live in `public/icons/*` and are copied to the build root verbatim
//    by Vite, so they are referenced by their output path here.
export default defineManifest({
  manifest_version: 3,
  name: 'RepoSize',
  version: '1.0.0',
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
      // Match every github.com page so the badge survives client-side (Turbo /
      // React Router) navigations into a repository from anywhere. The script
      // itself no-ops unless the URL resolves to an `owner/repo` page.
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
