import type { ApiError, RepoSizeData, Settings } from '../shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants';
import { getSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import { parseRepoFromUrl, repoKey } from '../shared/repo-url';
import {
  clearAll,
  setHandlers,
  showError,
  showLoading,
  showResult,
} from './injector';
import { startWatching } from './observer';

// Content-script entry point (whitepaper §4.3).
// Detects the current repository, requests its size from the background worker,
// injects the badge, and keeps everything in sync across SPA navigations.

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: RepoSizeData }
  | { kind: 'error'; error: ApiError };

let settings: Settings = DEFAULT_SETTINGS;
let current: { owner: string; repo: string; key: string } | null = null;
let view: View = { kind: 'idle' };
/** Monotonic token to discard responses from superseded requests. */
let fetchToken = 0;

async function init(): Promise<void> {
  settings = await getSettings();

  setHandlers({
    onRefresh: () => {
      if (current) void load(true);
    },
    onOpenOptions: () => {
      void sendMessage({ type: 'OPEN_OPTIONS' });
    },
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.settings]) {
      void onSettingsChanged();
    }
  });

  startWatching(reconcile);
  reconcile();
}

/** Idempotent: align the displayed badge with the current URL + DOM state. */
function reconcile(): void {
  const parsed = parseRepoFromUrl(location.href);

  if (!parsed) {
    if (current) {
      current = null;
      view = { kind: 'idle' };
      clearAll();
    }
    return;
  }

  const key = repoKey(parsed.owner, parsed.repo);
  if (!current || current.key !== key) {
    current = { owner: parsed.owner, repo: parsed.repo, key };
    void load(false);
    return;
  }

  // Same repository: re-assert placement (GitHub may have re-rendered the
  // header and dropped our badge). Rendering is idempotent.
  render();
}

async function load(force: boolean): Promise<void> {
  if (!current) return;
  const { owner, repo, key } = current;
  const token = ++fetchToken;

  view = { kind: 'loading' };
  render();

  const res = await sendMessage({
    type: 'GET_REPO_SIZE',
    payload: { owner, repo, forceRefresh: force },
  });

  // Discard if a newer request started or the user navigated away.
  if (token !== fetchToken || current?.key !== key) return;

  if (!res) {
    view = {
      kind: 'error',
      error: {
        kind: 'NETWORK',
        message: 'Extension is unavailable (try reloading the page).',
        hasToken: false,
      },
    };
  } else if (res.ok) {
    view = { kind: 'ready', data: res.data };
  } else {
    view = { kind: 'error', error: res.error };
  }
  render();
}

function render(): void {
  switch (view.kind) {
    case 'loading':
      showLoading(settings);
      break;
    case 'ready':
      showResult(view.data, settings);
      break;
    case 'error':
      showError(view.error, settings);
      break;
    case 'idle':
      break;
  }
}

async function onSettingsChanged(): Promise<void> {
  settings = await getSettings();
  render();
}

void init();
