import type {
  ClearCacheResult,
  RepoSizeData,
  Result,
  RuntimeMessage,
  Settings,
  ValidateTokenResult,
} from '../shared/types';
import {
  clearCache,
  getCache,
  getSettings,
  pruneExpiredCache,
  setCache,
  setSettings,
} from '../shared/storage';
import { fetchRepoSize, validateToken } from '../shared/api';

// Background service worker (whitepaper §4.1).
// Event-driven only: it owns GitHub API access, the repository cache, and
// message routing. It keeps no long-lived in-memory state.

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

async function bootstrap(): Promise<void> {
  // Seed + normalise defaults, then drop any stale cache entries.
  const settings = await setSettings({});
  await pruneExpiredCache(settings.cacheTTLHours);
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: {
          kind: 'UNKNOWN',
          message: err instanceof Error ? err.message : 'Unexpected error.',
          hasToken: false,
        },
      });
    });
  // Return true to keep the message channel open for the async response.
  return true;
});

async function handle(
  message: RuntimeMessage,
): Promise<
  | Result<RepoSizeData>
  | Settings
  | ClearCacheResult
  | ValidateTokenResult
  | { ok: true }
> {
  switch (message.type) {
    case 'GET_REPO_SIZE':
      return getRepoSize(message.payload);
    case 'GET_SETTINGS':
      return getSettings();
    case 'SET_SETTINGS':
      return setSettings(message.payload);
    case 'CLEAR_CACHE':
      return { ok: true, cleared: await clearCache() };
    case 'VALIDATE_TOKEN':
      return validateToken(message.payload.token);
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    default:
      return {
        ok: false,
        error: { kind: 'UNKNOWN', message: 'Unknown message type.', hasToken: false },
      };
  }
}

async function getRepoSize(payload: {
  owner: string;
  repo: string;
  forceRefresh?: boolean;
}): Promise<Result<RepoSizeData>> {
  const { owner, repo, forceRefresh } = payload;
  const settings = await getSettings();

  if (!forceRefresh) {
    const cached = await getCache(owner, repo, settings.cacheTTLHours);
    if (cached) {
      return { ok: true, data: { ...cached, fromCache: true } };
    }
  }

  const result = await fetchRepoSize(owner, repo, settings.pat);
  if (result.ok) {
    await setCache(owner, repo, {
      sizeKB: result.data.sizeKB,
      fetchedAt: result.data.fetchedAt,
      fullName: result.data.fullName,
      defaultBranch: result.data.defaultBranch,
      isPrivate: result.data.isPrivate,
      stargazers: result.data.stargazers,
    });
  }
  return result;
}
