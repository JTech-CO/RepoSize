import type { RepoIdentifier } from './types';

/**
 * First path segments on github.com that are reserved routes (never a user or
 * organisation namespace). Used to reject non-repository pages.
 */
const RESERVED_OWNERS = new Set<string>([
  'about',
  'account',
  'admin',
  'apps',
  'blog',
  'business',
  'careers',
  'cases',
  'codespaces',
  'collections',
  'contact',
  'customer-stories',
  'dashboard',
  'discussions',
  'enterprise',
  'enterprises',
  'events',
  'explore',
  'features',
  'fluidicon.png',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'organizations',
  'orgs',
  'pricing',
  'projects',
  'pull',
  'pulls',
  'readme',
  'search',
  'security',
  'sessions',
  'settings',
  'site',
  'sitemap.xml',
  'sponsors',
  'stars',
  'topics',
  'trending',
  'user',
  'users',
  'watching',
]);

/**
 * Second path segments that indicate a special (non-repository) resource even
 * though the first segment looks like an owner. Kept intentionally small.
 */
const RESERVED_REPO_NAMES = new Set<string>(['sponsors']);

/** Valid GitHub owner/repo name characters. */
const NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Parse a GitHub URL into an `owner/repo` reference, or `null` when the URL is
 * not a repository page. Sub-pages (e.g. `.../tree/main`, `.../issues`) still
 * resolve to their owning repository.
 */
export function parseRepoFromUrl(url: string): RepoIdentifier | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'github.com') return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');

  if (!NAME_RE.test(owner) || !NAME_RE.test(repo)) return null;
  if (repo === '.' || repo === '..') return null;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  if (RESERVED_REPO_NAMES.has(repo.toLowerCase())) return null;

  return { owner, repo };
}

/** Canonical lowercase cache/identity key for a repo. */
export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}
