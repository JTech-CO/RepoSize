import type { CacheEntry, Settings } from './types';
import { DEFAULT_SETTINGS, SETTING_BOUNDS, STORAGE_KEYS } from './constants';

// Thin, typed wrapper around chrome.storage.local for settings and cache.
// All persistence flows through here so behaviour stays consistent across the
// background worker, content script, popup and options page.

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Read settings, merged over defaults and sanitised. */
export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const stored = raw[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
  return normaliseSettings({ ...DEFAULT_SETTINGS, ...(stored ?? {}) });
}

/** Merge a partial patch into the current settings, persist, and return them. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normaliseSettings({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

function normaliseSettings(s: Settings): Settings {
  const unit: Settings['unit'] = s.unit === 'decimal' ? 'decimal' : 'binary';
  const displayPosition: Settings['displayPosition'] =
    s.displayPosition === 'about' || s.displayPosition === 'both'
      ? s.displayPosition
      : 'header';
  const pat =
    typeof s.pat === 'string' && s.pat.trim().length > 0 ? s.pat.trim() : null;
  return {
    unit,
    displayPosition,
    warningThresholdMB: clampNumber(
      s.warningThresholdMB,
      SETTING_BOUNDS.warningThresholdMB.min,
      SETTING_BOUNDS.warningThresholdMB.max,
      DEFAULT_SETTINGS.warningThresholdMB,
    ),
    cacheTTLHours: clampNumber(
      s.cacheTTLHours,
      SETTING_BOUNDS.cacheTTLHours.min,
      SETTING_BOUNDS.cacheTTLHours.max,
      DEFAULT_SETTINGS.cacheTTLHours,
    ),
    showEstimatedZip: Boolean(s.showEstimatedZip),
    pat,
  };
}

function cacheKey(owner: string, repo: string): string {
  return `${STORAGE_KEYS.cachePrefix}${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

/** Read a cache entry, transparently dropping it when past its TTL. */
export async function getCache(
  owner: string,
  repo: string,
  ttlHours: number,
): Promise<CacheEntry | null> {
  const key = cacheKey(owner, repo);
  const raw = await chrome.storage.local.get(key);
  const entry = raw[key] as CacheEntry | undefined;
  if (!entry) return null;

  if (ttlHours > 0) {
    const ageMs = Date.now() - entry.fetchedAt;
    if (ageMs > ttlHours * 3_600_000) {
      await chrome.storage.local.remove(key);
      return null;
    }
  }
  return entry;
}

export async function setCache(
  owner: string,
  repo: string,
  entry: CacheEntry,
): Promise<void> {
  await chrome.storage.local.set({ [cacheKey(owner, repo)]: entry });
}

/** Remove all cached repositories. Returns the number of entries cleared. */
export async function clearCache(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) =>
    k.startsWith(STORAGE_KEYS.cachePrefix),
  );
  if (keys.length > 0) await chrome.storage.local.remove(keys);
  return keys.length;
}

/** Drop expired cache entries (housekeeping on startup / install). */
export async function pruneExpiredCache(ttlHours: number): Promise<void> {
  if (ttlHours <= 0) return;
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const ttlMs = ttlHours * 3_600_000;
  const expired = Object.entries(all)
    .filter(
      ([k, v]) =>
        k.startsWith(STORAGE_KEYS.cachePrefix) &&
        v != null &&
        now - (v as CacheEntry).fetchedAt > ttlMs,
    )
    .map(([k]) => k);
  if (expired.length > 0) await chrome.storage.local.remove(expired);
}
