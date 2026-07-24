// Shared domain + messaging types for RepoSize.

/** Size unit system. Binary → KiB/MiB/GiB (1024). Decimal → KB/MB/GB (1000). */
export type SizeUnit = 'binary' | 'decimal';

/** Where the size badge is rendered on a repository page. */
export type DisplayPosition = 'header' | 'about' | 'both';

/** User-configurable settings (persisted in chrome.storage.local). */
export interface Settings {
  unit: SizeUnit;
  displayPosition: DisplayPosition;
  /** Size (in MiB) at/above which the badge shows a warning colour. */
  warningThresholdMB: number;
  /** Cache time-to-live in hours. `0` disables expiry. */
  cacheTTLHours: number;
  /** Show a rough estimated ZIP download size alongside the repo size. */
  showEstimatedZip: boolean;
  /** GitHub Personal Access Token (local only, optional). */
  pat: string | null;
}

/** A parsed `owner/repo` reference. */
export interface RepoIdentifier {
  owner: string;
  repo: string;
}

/** Repository size data returned to the UI layers. */
export interface RepoSizeData {
  fullName: string;
  /** Repository size in KB as reported by the GitHub API (1 KB = 1024 bytes). */
  sizeKB: number;
  /** Epoch millis when this data was fetched from the API. */
  fetchedAt: number;
  /** Whether this response was served from cache. */
  fromCache: boolean;
  defaultBranch: string | null;
  isPrivate: boolean;
  stargazers: number | null;
}

/** Cache record stored per repository. */
export interface CacheEntry {
  sizeKB: number;
  fetchedAt: number;
  fullName: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  stargazers: number | null;
}

export type ApiErrorKind =
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'AUTH'
  | 'NETWORK'
  | 'UNKNOWN';

export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  /** Whether a token was present for the failed request. */
  hasToken: boolean;
  /** Epoch seconds when the rate limit resets (RATE_LIMIT only). */
  rateLimitReset?: number;
}

/** Discriminated success/failure result. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

// ---------------------------------------------------------------------------
// Runtime messages (content script / popup / options → background worker)
// ---------------------------------------------------------------------------

export interface GetRepoSizeMessage {
  type: 'GET_REPO_SIZE';
  payload: RepoIdentifier & { forceRefresh?: boolean };
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

export interface SetSettingsMessage {
  type: 'SET_SETTINGS';
  payload: Partial<Settings>;
}

export interface ClearCacheMessage {
  type: 'CLEAR_CACHE';
}

export interface ValidateTokenMessage {
  type: 'VALIDATE_TOKEN';
  payload: { token: string };
}

export interface OpenOptionsMessage {
  type: 'OPEN_OPTIONS';
}

export type RuntimeMessage =
  | GetRepoSizeMessage
  | GetSettingsMessage
  | SetSettingsMessage
  | ClearCacheMessage
  | ValidateTokenMessage
  | OpenOptionsMessage;

export interface ValidateTokenResult {
  valid: boolean;
  login: string | null;
  message: string;
}

export interface ClearCacheResult {
  ok: true;
  cleared: number;
}

/** Maps each message `type` to the response the background worker returns. */
export interface ResponseMap {
  GET_REPO_SIZE: Result<RepoSizeData>;
  GET_SETTINGS: Settings;
  SET_SETTINGS: Settings;
  CLEAR_CACHE: ClearCacheResult;
  VALIDATE_TOKEN: ValidateTokenResult;
  OPEN_OPTIONS: { ok: true };
}
