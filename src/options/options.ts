import type { DisplayPosition, Settings, SizeUnit } from '../shared/types';
import { getSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';

// Options page: every setting with auto-save. The background worker normalises
// and persists each change; we reflect the returned settings back into the controls.

let settings: Settings;
let savedTimer: number | undefined;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`RepoSize options: missing #${id}`);
  return el as T;
}

const els = {
  threshold: byId<HTMLInputElement>('op-threshold'),
  zip: byId<HTMLInputElement>('op-zip'),
  ttl: byId<HTMLInputElement>('op-ttl'),
  clearCache: byId<HTMLButtonElement>('op-clear-cache'),
  clearMsg: byId('op-clear-msg'),
  token: byId<HTMLInputElement>('op-token'),
  tokenSave: byId<HTMLButtonElement>('op-token-save'),
  tokenClear: byId<HTMLButtonElement>('op-token-clear'),
  tokenState: byId('op-token-state'),
  tokenMsg: byId('op-token-msg'),
  saved: byId('op-saved'),
};

const unitButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('#op-unit button[data-unit]'),
);

const positionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('#op-position button[data-position]'),
);

async function main(): Promise<void> {
  settings = await getSettings();
  populate();
  wire();
}

function populate(): void {
  for (const btn of unitButtons) {
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(btn.dataset.unit === settings.unit));
  }
  for (const btn of positionButtons) {
    btn.setAttribute('role', 'radio');
    btn.setAttribute(
      'aria-checked',
      String(btn.dataset.position === settings.displayPosition),
    );
  }
  els.threshold.value = String(settings.warningThresholdMB);
  els.zip.checked = settings.showEstimatedZip;
  els.ttl.value = String(settings.cacheTTLHours);
  syncTokenState();
}

function wire(): void {
  for (const btn of unitButtons) {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit as SizeUnit | undefined;
      if (unit && unit !== settings.unit) void save({ unit });
    });
  }

  for (const btn of positionButtons) {
    btn.addEventListener('click', () => {
      const position = btn.dataset.position as DisplayPosition | undefined;
      if (position && position !== settings.displayPosition) {
        void save({ displayPosition: position });
      }
    });
  }

  els.threshold.addEventListener('change', () => {
    void save({ warningThresholdMB: Number(els.threshold.value) });
  });

  els.ttl.addEventListener('change', () => {
    void save({ cacheTTLHours: Number(els.ttl.value) });
  });

  els.zip.addEventListener('change', () => {
    void save({ showEstimatedZip: els.zip.checked });
  });

  els.clearCache.addEventListener('click', () => void clearCache());
  els.tokenSave.addEventListener('click', () => void saveToken());
  els.tokenClear.addEventListener('click', () => void clearToken());
}

async function save(patch: Partial<Settings>): Promise<void> {
  const next = await sendMessage({ type: 'SET_SETTINGS', payload: patch });
  settings = next ?? { ...settings, ...patch };
  populate();
  flashSaved();
}

function flashSaved(): void {
  els.saved.hidden = false;
  els.saved.style.opacity = '1';
  if (savedTimer !== undefined) clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => {
    els.saved.style.opacity = '0';
    window.setTimeout(() => {
      els.saved.hidden = true;
    }, 200);
  }, 1400);
}

async function clearCache(): Promise<void> {
  els.clearCache.disabled = true;
  const res = await sendMessage({ type: 'CLEAR_CACHE' });
  els.clearCache.disabled = false;
  const count = res?.cleared ?? 0;
  setMsg(
    els.clearMsg,
    count === 1 ? 'Cleared 1 repository.' : `Cleared ${count} repositories.`,
    'ok',
  );
}

// --- Token -----------------------------------------------------------------

function syncTokenState(): void {
  const hasToken = Boolean(settings.pat);
  setMsg(els.tokenState, hasToken ? '● token saved' : 'no token', hasToken ? 'ok' : '');
  els.token.placeholder = hasToken ? '•••••••••• (saved)' : 'ghp_… (optional)';
}

async function saveToken(): Promise<void> {
  const value = els.token.value.trim();
  if (!value) {
    setMsg(els.tokenMsg, 'Enter a token first.', 'error');
    return;
  }
  els.tokenSave.disabled = true;
  setMsg(els.tokenMsg, 'Validating…', '');

  const result = await sendMessage({ type: 'VALIDATE_TOKEN', payload: { token: value } });
  if (!result || !result.valid) {
    setMsg(els.tokenMsg, result?.message ?? 'Validation failed.', 'error');
    els.tokenSave.disabled = false;
    return;
  }

  settings = (await sendMessage({ type: 'SET_SETTINGS', payload: { pat: value } })) ?? settings;
  els.token.value = '';
  els.tokenSave.disabled = false;
  syncTokenState();
  setMsg(els.tokenMsg, result.message, 'ok');
  flashSaved();
}

async function clearToken(): Promise<void> {
  settings = (await sendMessage({ type: 'SET_SETTINGS', payload: { pat: null } })) ?? settings;
  els.token.value = '';
  syncTokenState();
  setMsg(els.tokenMsg, 'Token removed.', 'ok');
  flashSaved();
}

function setMsg(el: HTMLElement, text: string, kind: 'ok' | 'error' | ''): void {
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

void main();
