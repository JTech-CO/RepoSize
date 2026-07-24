import type { ApiError, RepoSizeData, Result, ValidateTokenResult } from './types';
import { GITHUB_API_BASE, GITHUB_API_VERSION } from './constants';

// GitHub REST API access (runs in the background service worker).

interface GitHubRepoResponse {
  full_name?: string;
  size?: number;
  default_branch?: string;
  private?: boolean;
  stargazers_count?: number;
  message?: string;
}

interface GitHubTreeResponse {
  tree?: Array<{ type?: string; size?: number }>;
  truncated?: boolean;
}

function baseHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function fail(error: ApiError): Result<never> {
  return { ok: false, error };
}

/** Fetch repository metadata (size, visibility, etc.) for `owner/repo`. */
export async function fetchRepoSize(
  owner: string,
  repo: string,
  token: string | null,
): Promise<Result<RepoSizeData>> {
  const hasToken = Boolean(token);
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: baseHeaders(token) });
  } catch {
    return fail({
      kind: 'NETWORK',
      message: 'Network error while contacting GitHub.',
      hasToken,
    });
  }

  if (res.ok) {
    let json: GitHubRepoResponse;
    try {
      json = (await res.json()) as GitHubRepoResponse;
    } catch {
      return fail({
        kind: 'UNKNOWN',
        message: 'Could not parse the GitHub API response.',
        hasToken,
      });
    }
    if (typeof json.size !== 'number') {
      return fail({
        kind: 'UNKNOWN',
        message: 'Unexpected API response (missing size field).',
        hasToken,
      });
    }

    const defaultBranch = json.default_branch ?? null;
    let sizeKB = json.size;
    // GitHub computes repo size asynchronously and can report 0 for recently
    // created or pushed repos. Fall back to summing the default branch's blobs.
    if (sizeKB === 0 && defaultBranch) {
      const treeKB = await fetchTreeSizeKB(owner, repo, defaultBranch, token);
      if (treeKB && treeKB > 0) sizeKB = treeKB;
    }

    return {
      ok: true,
      data: {
        fullName: json.full_name ?? `${owner}/${repo}`,
        sizeKB,
        fetchedAt: Date.now(),
        fromCache: false,
        defaultBranch,
        isPrivate: Boolean(json.private),
        stargazers:
          typeof json.stargazers_count === 'number'
            ? json.stargazers_count
            : null,
      },
    };
  }

  return fail(classifyError(res, hasToken));
}

/** Sum the default branch's blob sizes (KB); fallback when the API `size` is 0. */
async function fetchTreeSizeKB(
  owner: string,
  repo: string,
  branch: string,
  token: string | null,
): Promise<number | null> {
  const url =
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
    `/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  try {
    const res = await fetch(url, { headers: baseHeaders(token) });
    if (!res.ok) return null;
    const json = (await res.json()) as GitHubTreeResponse;
    if (!Array.isArray(json.tree)) return null;
    const bytes = json.tree.reduce(
      (sum, entry) => (entry.type === 'blob' ? sum + (entry.size ?? 0) : sum),
      0,
    );
    return Math.round(bytes / 1024);
  } catch {
    return null;
  }
}

function classifyError(res: Response, hasToken: boolean): ApiError {
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  const retryAfter = res.headers.get('retry-after');
  const rateLimited =
    (res.status === 403 || res.status === 429) &&
    (remaining === '0' || retryAfter !== null);

  if (rateLimited) {
    return {
      kind: 'RATE_LIMIT',
      message: hasToken
        ? 'GitHub API rate limit reached even with your token. Please wait a little.'
        : 'GitHub API rate limit reached. Add a Personal Access Token to raise the limit.',
      hasToken,
      ...(reset ? { rateLimitReset: Number(reset) } : {}),
    };
  }
  if (res.status === 401) {
    return {
      kind: 'AUTH',
      message: 'Your token was rejected (401). Check the Personal Access Token.',
      hasToken,
    };
  }
  if (res.status === 404) {
    return {
      kind: 'NOT_FOUND',
      message: hasToken
        ? 'Repository not found.'
        : 'Repository not found. If it is private, add a token in options.',
      hasToken,
    };
  }
  if (res.status === 403) {
    return { kind: 'AUTH', message: 'Access forbidden by GitHub (403).', hasToken };
  }
  return {
    kind: 'UNKNOWN',
    message: `GitHub API error (HTTP ${res.status}).`,
    hasToken,
  };
}

/** Validate a Personal Access Token by calling the authenticated user endpoint. */
export async function validateToken(token: string): Promise<ValidateTokenResult> {
  if (!token.trim()) {
    return { valid: false, login: null, message: 'Token is empty.' };
  }
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: baseHeaders(token.trim()),
    });
  } catch {
    return { valid: false, login: null, message: 'Network error while validating.' };
  }
  if (res.ok) {
    let login: string | null = null;
    try {
      const json = (await res.json()) as { login?: string };
      login = json.login ?? null;
    } catch {
      /* ignore body parse issues; the 2xx already proves validity */
    }
    return {
      valid: true,
      login,
      message: login ? `Token is valid (signed in as ${login}).` : 'Token is valid.',
    };
  }
  if (res.status === 401) {
    return { valid: false, login: null, message: 'Token is invalid or expired.' };
  }
  return {
    valid: false,
    login: null,
    message: `Could not validate token (HTTP ${res.status}).`,
  };
}
