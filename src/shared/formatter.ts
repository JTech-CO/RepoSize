import type { SizeUnit } from './types';
import { ZIP_ESTIMATE_FACTOR } from './constants';

/** Severity of a repository's size relative to the user's warning threshold. */
export type WarningLevel = 'none' | 'warning' | 'danger';

/**
 * Format a repository size (reported by GitHub in 1024-byte KB) into a
 * human-readable string.
 *
 * The source value is converted to bytes first so decimal units are accurate:
 *   - binary  → KiB / MiB / GiB (base 1024)
 *   - decimal → KB  / MB  / GB  (base 1000)
 */
export function formatSize(sizeKB: number, unit: SizeUnit): string {
  const bytes = Math.max(0, Math.round(sizeKB)) * 1024;
  const base = unit === 'binary' ? 1024 : 1000;
  const kilo = bytes / base;

  if (bytes < base * base) {
    const kUnit = unit === 'binary' ? 'KiB' : 'KB';
    return `${kilo.toFixed(kilo < 10 && kilo > 0 ? 1 : 0)} ${kUnit}`;
  }

  const mega = kilo / base;
  if (mega < base) {
    const mUnit = unit === 'binary' ? 'MiB' : 'MB';
    return `${mega.toFixed(1)} ${mUnit}`;
  }

  const giga = mega / base;
  const gUnit = unit === 'binary' ? 'GiB' : 'GB';
  return `${giga.toFixed(2)} ${gUnit}`;
}

/**
 * Classify a size against the warning threshold (interpreted in MiB).
 * `danger` triggers at 2× the threshold.
 */
export function getWarningLevel(
  sizeKB: number,
  thresholdMB: number,
): WarningLevel {
  if (thresholdMB <= 0) return 'none';
  const sizeMiB = sizeKB / 1024;
  if (sizeMiB >= thresholdMB * 2) return 'danger';
  if (sizeMiB >= thresholdMB) return 'warning';
  return 'none';
}

/** Rough estimated ZIP download size string (opt-in, clearly approximate). */
export function formatEstimatedZip(sizeKB: number, unit: SizeUnit): string {
  return `≈ ${formatSize(sizeKB * ZIP_ESTIMATE_FACTOR, unit)}`;
}

/** Compact relative-time label, e.g. "just now", "3 min ago", "2 h ago". */
export function formatRelativeTime(fromMillis: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - fromMillis) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
