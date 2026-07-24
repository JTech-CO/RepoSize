import type { ApiError, RepoSizeData, RepoIdentifier, Settings, SizeUnit } from '../shared/types';
import { getSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import { parseRepoFromUrl } from '../shared/repo-url';
import { formatRelativeTime, formatSize, getWarningLevel } from '../shared/formatter';

// Popup: shows the active tab's repository size, a unit toggle, and quick token
// management. Reads the active tab via the `activeTab` permission (granted on
// the user's click).

let settings: Settings;
let currentRepo: RepoIdentifier | null = null;
let currentData: RepoSizeData | null = null;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`RepoSize popup: missing #${id}`);
  return el as T;
}

const statusEl = byId('rs-status');
const refreshBtn = byId<HTMLButtonElement>('rs-refresh');

async function main(): Promise<void> {
  settings = await getSettings();
  wireControls();
  syncUnitButtons();
  syncTokenState();

  const tab = await getActiveTab();
  currentRepo = parseRepoFromUrl(tab?.url ?? '');
  if (!currentRepo) {
    renderNoRepo();
    return;
  }
  await loadSize(false);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch {
    return undefined;
  }
}

async function loadSize(force: boolean): Promise<void> {
  if (!currentRepo) return;
  renderLoading();
  const res = await sendMessage({
    type: 'GET_REPO_SIZE',
    payload: { ...currentRepo, forceRefresh: force },
  });
  if (!res) {
    renderError({ kind: 'NETWORK', message: 'Extension is unavailable.', hasToken: false });
    return;
  }
  if (res.ok) {
    currentData = res.data;
    renderReady(res.data);
  } else {
    renderError(res.error);
  }
}

// --- Rendering -------------------------------------------------------------

function clearStatus(): void {
  statusEl.textContent = '';
}

function renderLoading(): void {
  refreshBtn.hidden = true;
  clearStatus();
  const skel = document.createElement('div');
  skel.className = 'rs-skeleton';
  statusEl.appendChild(skel);
}

function renderNoRepo(): void {
  refreshBtn.hidden = true;
  clearStatus();
  const p = document.createElement('div');
  p.className = 'rs-empty';
  p.textContent = 'Open a GitHub repository to see its size.';
  statusEl.appendChild(p);
}

function renderReady(data: RepoSizeData): void {
  refreshBtn.hidden = false;
  clearStatus();

  const repo = document.createElement('span');
  repo.className = 'rs-repo';
  repo.textContent = data.fullName;

  const level = getWarningLevel(data.sizeKB, settings.warningThresholdMB);
  const size = document.createElement('div');
  size.className =
    'rs-size' +
    (level === 'warning' ? ' rs-size--warning' : level === 'danger' ? ' rs-size--danger' : '');
  size.textContent = formatSize(data.sizeKB, settings.unit);

  const meta = document.createElement('div');
  meta.className = 'rs-meta';
  meta.appendChild(metaSpan(data.isPrivate ? 'Private' : 'Public'));
  if (data.stargazers !== null) {
    meta.appendChild(metaSpan(`★ ${data.stargazers.toLocaleString()}`));
  }
  meta.appendChild(
    metaSpan(`${formatRelativeTime(data.fetchedAt)}${data.fromCache ? ' · cached' : ''}`),
  );

  statusEl.append(repo, size, meta);
}

function metaSpan(text: string): HTMLElement {
  const s = document.createElement('span');
  s.textContent = text;
  return s;
}

function renderError(error: ApiError): void {
  refreshBtn.hidden = false;
  clearStatus();

  const msg = document.createElement('div');
  msg.className = 'rs-error';
  msg.textContent = error.message;
  statusEl.appendChild(msg);

  if (error.kind === 'RATE_LIMIT' && !error.hasToken) {
    const hint = document.createElement('div');
    hint.className = 'rs-error-hint';
    hint.textContent = 'Add a token below to raise the rate limit.';
    statusEl.appendChild(hint);
  }
}

// --- Controls --------------------------------------------------------------

function wireControls(): void {
  refreshBtn.addEventListener('click', () => void loadSize(true));

  for (const btn of document.querySelectorAll<HTMLButtonElement>('.rs-seg-btn')) {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit as SizeUnit | undefined;
      if (unit && unit !== settings.unit) void changeUnit(unit);
    });
  }

  byId('rs-options').addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  });

  byId<HTMLButtonElement>('rs-token-save').addEventListener('click', () => void saveToken());
  byId<HTMLButtonElement>('rs-token-clear').addEventListener('click', () => void clearToken());
}

async function changeUnit(unit: SizeUnit): Promise<void> {
  settings = (await sendMessage({ type: 'SET_SETTINGS', payload: { unit } })) ?? {
    ...settings,
    unit,
  };
  syncUnitButtons();
  if (currentData) renderReady(currentData);
}

function syncUnitButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.rs-seg-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.unit === settings.unit));
  }
}

// --- Token management ------------------------------------------------------

function syncTokenState(): void {
  const state = byId('rs-token-state');
  const hasToken = Boolean(settings.pat);
  state.textContent = hasToken ? '● saved' : 'not set';
  state.dataset.set = String(hasToken);
  if (hasToken) {
    byId<HTMLInputElement>('rs-token-input').placeholder = '•••••••••• (saved)';
  }
}

function setTokenMsg(text: string, kind: 'ok' | 'error' | ''): void {
  const msg = byId('rs-token-msg');
  msg.textContent = text;
  if (kind) msg.dataset.kind = kind;
  else delete msg.dataset.kind;
}

async function saveToken(): Promise<void> {
  const input = byId<HTMLInputElement>('rs-token-input');
  const value = input.value.trim();
  if (!value) {
    setTokenMsg('Enter a token first.', 'error');
    return;
  }
  const saveBtn = byId<HTMLButtonElement>('rs-token-save');
  saveBtn.disabled = true;
  setTokenMsg('Validating…', '');

  const result = await sendMessage({ type: 'VALIDATE_TOKEN', payload: { token: value } });
  if (!result || !result.valid) {
    setTokenMsg(result?.message ?? 'Validation failed.', 'error');
    saveBtn.disabled = false;
    return;
  }

  settings = (await sendMessage({ type: 'SET_SETTINGS', payload: { pat: value } })) ?? settings;
  input.value = '';
  saveBtn.disabled = false;
  syncTokenState();
  setTokenMsg(result.message, 'ok');
  if (currentRepo) void loadSize(true);
}

async function clearToken(): Promise<void> {
  settings = (await sendMessage({ type: 'SET_SETTINGS', payload: { pat: null } })) ?? settings;
  byId<HTMLInputElement>('rs-token-input').value = '';
  syncTokenState();
  setTokenMsg('Token cleared.', 'ok');
}

void main();
