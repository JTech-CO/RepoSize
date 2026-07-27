# RepoSize

> **See a GitHub repository's real size before you download or clone it.**

**[Chrome Web Store](#)** · **[Privacy Policy](<https://jtech-co.github.io/RepoSize/privacy-policy.html>)** · **[Chrome Web Store](<https://chromewebstore.google.com/detail/kjaekbpjbnkkepmhbegkcdegefociffe?utm_source=item-share-cb>)**

## 1. Introduction

RepoSize is a lightweight Chrome (Manifest V3) extension that adds a small,
native-looking badge to GitHub repository pages showing the repository's actual
size — so you can catch an unexpectedly large repo **before** downloading the ZIP
or cloning it. It works on public repositories with no setup, and warns you when
a repository is unusually large.

**Key features**

- **Accurate size badge**: reads the size from the GitHub API and shows it right
  in the repository header, matching GitHub's light/dark theme.
- **Large-repo warnings**: a configurable threshold turns the badge amber
  (large) or red (very large).
- **Zero-friction, with private-repo support**: no token needed for public repos;
  an optional Personal Access Token (stored locally) unlocks private repos and a
  higher API rate limit.
- **Smart caching & robust injection**: caches sizes to stay under the rate
  limit, and survives GitHub's frequent UI changes and client-side navigation.

## 2. Tech Stack

- **Platform**: Chrome Extension Manifest V3
- **Language**: TypeScript 5 (type-checking) + vanilla DOM (no UI framework)
- **Build**: Vite 6 + @crxjs/vite-plugin
- **Storage**: `chrome.storage.local` (settings + size cache)
- **External**: GitHub REST API — no backend server

## 3. Quick Start

**Requirements**: Node.js LTS (22 or 24) recommended.

1. **Install**

   ```bash
   git clone <repository-url>
   cd RepoSize
   npm install
   ```

2. **Build** _(no environment variables required)_

   ```bash
   npm run build
   ```

   > On **Windows + Node 25**, use `npm run build:win` instead — a retry wrapper
   > that works around a sporadic Node 25 native crash in the build toolchain.

3. **Load in Chrome**

   - Open `chrome://extensions` and enable **Developer mode**.
   - Click **Load unpacked** and select the generated **`dist/`** folder (the one
     that contains `manifest.json`).
   - Visit any repository, e.g. `https://github.com/facebook/react`.

To produce a store-ready ZIP (with `manifest.json` at the archive root):

```bash
npm run package
```

## 4. Structure

```text
src/
├── background/       # Service worker: GitHub API, cache, message routing
├── content/          # URL detection, badge injection, MutationObserver, styles
├── popup/            # Toolbar popup UI
├── options/          # Settings page
├── shared/           # types, constants, formatter, storage, api, messaging
└── manifest.config.ts
public/icons/         # Extension icons
scripts/              # build / clean / zip / icon generation
```

## 5. Info

- **License**: MIT
- **Privacy**: [Privacy Policy](<https://jtech-co.github.io/RepoSize/privacy-policy.html>)
- **Chrome Web Store**: [link](<https://chromewebstore.google.com/detail/kjaekbpjbnkkepmhbegkcdegefociffe?utm_source=item-share-cb>)
