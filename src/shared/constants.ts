import type { Settings } from './types';

/** GitHub REST API base URL. */
export const GITHUB_API_BASE = 'https://api.github.com';

/** GitHub API version pin (see docs.github.com/rest/overview/api-versions). */
export const GITHUB_API_VERSION = '2022-11-28';

/** chrome.storage.local keys. */
export const STORAGE_KEYS = {
  settings: 'reposize:settings',
  cachePrefix: 'reposize:cache:',
} as const;

/** Factory defaults (whitepaper §2.4). */
export const DEFAULT_SETTINGS: Settings = {
  unit: 'binary',
  displayPosition: 'header',
  warningThresholdMB: 500,
  cacheTTLHours: 24,
  showEstimatedZip: false,
  pat: null,
};

/** Setting bounds used for sanitisation. */
export const SETTING_BOUNDS = {
  warningThresholdMB: { min: 1, max: 1_000_000 },
  cacheTTLHours: { min: 0, max: 24 * 30 },
} as const;

/**
 * Rough factor to estimate a source ZIP download from the reported repo size.
 * The API `size` includes packed .git history, so the exported snapshot is
 * typically a fraction of it. This is intentionally approximate (opt-in only).
 */
export const ZIP_ESTIMATE_FACTOR = 0.45;

// Stable DOM identifiers/classes for injected UI (namespaced to avoid clashes).
export const DOM = {
  badgeHeaderId: 'reposize-badge-header',
  aboutRowId: 'reposize-about-row',
  popoverId: 'reposize-popover',
  badgeClass: 'reposize-badge',
  /** dataset attribute carrying the repo key a badge currently represents. */
  keyAttr: 'data-reposize-key',
  stateAttr: 'data-reposize-state',
} as const;
