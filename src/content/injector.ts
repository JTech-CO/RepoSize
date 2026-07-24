import type { ApiError, RepoSizeData, Settings } from '../shared/types';
import { DOM } from '../shared/constants';
import {
  formatEstimatedZip,
  formatRelativeTime,
  formatSize,
  getWarningLevel,
  type WarningLevel,
} from '../shared/formatter';

// Badge injection + detail popover. The header anchor is resolved through
// ordered fallback strategies; all rendering is idempotent (reused, keyed by id).

// Static SVG markup (never interpolated), so innerHTML on the icon span is safe.
const ICONS = {
  size:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<rect x="2" y="3" width="7" height="2.2" rx="1.1"/>' +
    '<rect x="2" y="6.9" width="10" height="2.2" rx="1.1"/>' +
    '<rect x="2" y="10.8" width="12" height="2.2" rx="1.1"/></svg>',
  alert:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
} as const;

export interface InjectorHandlers {
  onRefresh: () => void;
  onOpenOptions: () => void;
}

let handlers: InjectorHandlers = { onRefresh: () => {}, onOpenOptions: () => {} };

/** Current render context, consumed by the detail popover. */
let ctx:
  | { settings: Settings; data?: RepoSizeData; error?: ApiError }
  | null = null;

export function setHandlers(next: InjectorHandlers): void {
  handlers = next;
}

// ---------------------------------------------------------------------------
// Public render API
// ---------------------------------------------------------------------------

export function showLoading(settings: Settings): void {
  ctx = { settings };
  const pos = activePositions(settings);
  if (pos.header) {
    renderHeaderBadge({
      state: 'loading',
      text: '',
      level: 'none',
      title: 'RepoSize — loading repository size…',
      ariaLabel: 'Loading repository size',
      clickable: false,
      repoKey: null,
    });
  } else {
    removeHeaderBadge();
  }
  if (pos.about) {
    renderAboutRow({ state: 'loading', text: 'Loading…', level: 'none' });
  } else {
    removeAboutRow();
  }
}

export function showResult(data: RepoSizeData, settings: Settings): void {
  const prev = ctx;
  ctx = { settings, data };
  const level = getWarningLevel(data.sizeKB, settings.warningThresholdMB);
  const text = formatSize(data.sizeKB, settings.unit);
  const title = buildTitle(data, settings, level);
  const pos = activePositions(settings);

  if (pos.header) {
    renderHeaderBadge({
      state: 'ready',
      text,
      level,
      title,
      ariaLabel: `Repository size: ${text}. Click for details.`,
      clickable: true,
      repoKey: data.fullName.toLowerCase(),
    });
  } else {
    removeHeaderBadge();
  }
  if (pos.about) {
    renderAboutRow({ state: 'ready', text, level });
  } else {
    removeAboutRow();
  }

  // Only refresh an open popover when data/settings actually changed, since
  // reconcile() re-renders idempotently on every DOM mutation.
  const changed =
    prev?.data?.fetchedAt !== data.fetchedAt ||
    prev.settings.unit !== settings.unit ||
    prev.settings.showEstimatedZip !== settings.showEstimatedZip;
  if (changed) refreshOpenPopover();
}

export function showError(error: ApiError, settings: Settings): void {
  const prev = ctx;
  ctx = { settings, error };
  const pos = activePositions(settings);
  if (pos.header) {
    renderHeaderBadge({
      state: 'error',
      text: 'size?',
      level: 'none',
      title: `RepoSize — ${error.message}`,
      ariaLabel: `Repository size unavailable: ${error.message}`,
      clickable: true,
      repoKey: null,
    });
  } else {
    removeHeaderBadge();
  }
  if (pos.about) {
    renderAboutRow({ state: 'error', text: 'Unavailable', level: 'none' });
  } else {
    removeAboutRow();
  }

  if (prev?.error?.message !== error.message) refreshOpenPopover();
}

export function clearAll(): void {
  ctx = null;
  closePopover();
  removeHeaderBadge();
  removeAboutRow();
}

// ---------------------------------------------------------------------------
// Header badge
// ---------------------------------------------------------------------------

interface BadgeOpts {
  state: 'loading' | 'ready' | 'error';
  text: string;
  level: WarningLevel;
  title: string;
  ariaLabel: string;
  clickable: boolean;
  repoKey: string | null;
}

function renderHeaderBadge(opts: BadgeOpts): void {
  let el = document.getElementById(DOM.badgeHeaderId) as HTMLElement | null;

  if (!el || !el.isConnected) {
    el?.remove();
    const insertion = findHeaderInsertion();
    if (!insertion) return; // No anchor yet; the observer will retry.
    el = document.createElement('span');
    el.id = DOM.badgeHeaderId;
    insertion.container.insertBefore(el, insertion.ref);
  }

  applyBadge(el, opts);
}

function applyBadge(el: HTMLElement, opts: BadgeOpts): void {
  const warn = opts.state === 'ready' && opts.level === 'warning';
  const danger = opts.state === 'ready' && opts.level === 'danger';
  el.className = [
    DOM.badgeClass,
    opts.state === 'loading' && 'reposize-badge--loading',
    opts.state === 'error' && 'reposize-badge--error',
    warn && 'reposize-badge--warning',
    danger && 'reposize-badge--danger',
  ]
    .filter(Boolean)
    .join(' ');

  el.setAttribute('title', opts.title);
  el.setAttribute('aria-label', opts.ariaLabel);
  el.setAttribute(DOM.stateAttr, opts.state);
  if (opts.repoKey) el.setAttribute(DOM.keyAttr, opts.repoKey);
  else el.removeAttribute(DOM.keyAttr);

  // Rebuild children only on change: an unconditional rebuild would trip the
  // MutationObserver → reconcile → rebuild loop (attribute writes aren't observed).
  const alertIcon = warn || danger || opts.state === 'error';
  const sig = `${alertIcon ? 'alert' : 'size'}|${opts.text}`;
  if (el.dataset.reposizeSig !== sig) {
    el.dataset.reposizeSig = sig;
    el.textContent = '';
    const icon = document.createElement('span');
    icon.className = 'reposize-badge__icon';
    icon.innerHTML = alertIcon ? ICONS.alert : ICONS.size;
    const text = document.createElement('span');
    text.className = 'reposize-badge__text';
    text.textContent = opts.text;
    el.append(icon, text);
  }

  if (opts.clickable) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePopover(el);
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePopover(el);
      }
    };
  } else {
    el.removeAttribute('role');
    el.removeAttribute('tabindex');
    el.onclick = null;
    el.onkeydown = null;
  }
}

function removeHeaderBadge(): void {
  document.getElementById(DOM.badgeHeaderId)?.remove();
}

/**
 * Ordered anchor strategies for the repository header. The first that resolves
 * wins; each returns the container + reference node for `insertBefore`.
 */
function findHeaderInsertion(): { container: Element; ref: Node | null } | null {
  const root = getHeaderRoot();

  // A) Right after the visibility label ("Public" / "Private" / "Internal").
  if (root) {
    const label = findVisibilityLabel(root);
    if (label?.parentElement) {
      return { container: label.parentElement, ref: label.nextSibling };
    }
  }

  // B) Right after the repository name element.
  const name = document.querySelector('strong[itemprop="name"]');
  if (name?.parentElement) {
    return { container: name.parentElement, ref: name.nextSibling };
  }

  // C) Just before the repository navigation tabs.
  const nav = document.querySelector('nav[aria-label="Repository"]');
  if (nav?.parentElement) {
    return { container: nav.parentElement, ref: nav };
  }

  // D) Fallback: append into the header root.
  if (root) {
    return { container: root, ref: null };
  }

  return null;
}

function getHeaderRoot(): Element | null {
  return (
    document.querySelector('#repository-container-header') ??
    document.querySelector('[data-testid="repository-container-header"]') ??
    document.querySelector('.pagehead.repohead') ??
    document.querySelector('.pagehead') ??
    document.querySelector('strong[itemprop="name"]')?.closest('header, div[class*="header" i]') ??
    null
  );
}

function findVisibilityLabel(root: Element): Element | null {
  for (const el of root.querySelectorAll('span, a, summary')) {
    if (el.childElementCount !== 0) continue;
    const text = el.textContent?.trim();
    if (text === 'Public' || text === 'Private' || text === 'Internal') {
      return el;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// About-section row
// ---------------------------------------------------------------------------

function renderAboutRow(opts: {
  state: 'loading' | 'ready' | 'error';
  text: string;
  level: WarningLevel;
}): void {
  let row = document.getElementById(DOM.aboutRowId) as HTMLElement | null;

  if (!row || !row.isConnected) {
    row?.remove();
    const insertion = findAboutInsertion();
    if (!insertion) return;
    row = document.createElement('div');
    row.id = DOM.aboutRowId;
    row.className = 'reposize-about-row';
    insertion.container.insertBefore(row, insertion.ref);
  }

  const color =
    opts.level === 'danger'
      ? 'var(--fgColor-danger, var(--color-danger-fg, #cf222e))'
      : opts.level === 'warning'
        ? 'var(--fgColor-attention, var(--color-attention-fg, #9a6700))'
        : '';
  row.style.color = color;

  // Rebuild children only on change (see applyBadge for the rationale).
  const sig = `${opts.level === 'none' ? 'size' : 'alert'}|${opts.text}`;
  if (row.dataset.reposizeSig === sig) return;
  row.dataset.reposizeSig = sig;

  row.textContent = '';
  const label = document.createElement('span');
  label.className = 'reposize-about-row__label';
  const icon = document.createElement('span');
  icon.innerHTML = opts.level === 'none' ? ICONS.size : ICONS.alert;
  const labelText = document.createElement('span');
  labelText.textContent = 'Repository size';
  label.append(icon, labelText);

  const value = document.createElement('strong');
  value.textContent = opts.text;

  row.append(label, value);
}

function findAboutInsertion(): { container: Element; ref: Node | null } | null {
  const aboutHeading = Array.from(
    document.querySelectorAll('.Layout-sidebar h2, .Layout-sidebar h3, h2, h3'),
  ).find((h) => h.textContent?.trim() === 'About');

  if (aboutHeading) {
    const cell = aboutHeading.closest('.BorderGrid-cell') ?? aboutHeading.parentElement;
    if (cell) {
      // Append near the end of the About cell.
      return { container: cell, ref: null };
    }
  }
  return null;
}

function removeAboutRow(): void {
  document.getElementById(DOM.aboutRowId)?.remove();
}

// ---------------------------------------------------------------------------
// Detail popover
// ---------------------------------------------------------------------------

let activePopover: { el: HTMLElement; cleanup: () => void } | null = null;

function togglePopover(anchor: HTMLElement): void {
  if (activePopover) {
    closePopover();
    return;
  }
  openPopover(anchor);
}

function refreshOpenPopover(): void {
  if (!activePopover) return;
  const anchor = document.getElementById(DOM.badgeHeaderId) as HTMLElement | null;
  closePopover();
  if (anchor) openPopover(anchor);
}

function openPopover(anchor: HTMLElement): void {
  if (!ctx) return;
  const el = document.createElement('div');
  el.id = DOM.popoverId;
  el.className = 'reposize-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Repository size details');

  if (ctx.data) buildDataPopover(el, ctx.data, ctx.settings);
  else if (ctx.error) buildErrorPopover(el, ctx.error);

  document.body.appendChild(el);
  positionPopover(el, anchor);

  const onDocPointer = (e: Event) => {
    if (e.target instanceof Node && !el.contains(e.target) && !anchor.contains(e.target)) {
      closePopover();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopover();
  };
  const onScroll = () => closePopover();

  // Defer attaching the outside-click listener so the opening click doesn't
  // immediately close it.
  setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true), 0);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll, true);

  activePopover = {
    el,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll, true);
    },
  };
}

function closePopover(): void {
  if (!activePopover) return;
  activePopover.cleanup();
  activePopover.el.remove();
  activePopover = null;
}

function positionPopover(el: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = el.offsetWidth || 260;
  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - width - margin;
  left = Math.max(window.scrollX + margin, Math.min(left, maxLeft));
  el.style.top = `${rect.bottom + window.scrollY + 6}px`;
  el.style.left = `${left}px`;
}

function buildDataPopover(el: HTMLElement, data: RepoSizeData, settings: Settings): void {
  const titleRow = div('reposize-popover__title');
  titleRow.append(
    span(undefined, data.fullName),
    span('reposize-popover__size', formatSize(data.sizeKB, settings.unit)),
  );
  el.appendChild(titleRow);

  const altUnit = settings.unit === 'binary' ? 'decimal' : 'binary';
  el.appendChild(
    detailRow(altUnit === 'decimal' ? 'Decimal' : 'Binary', formatSize(data.sizeKB, altUnit)),
  );
  if (settings.showEstimatedZip) {
    el.appendChild(detailRow('Est. ZIP', formatEstimatedZip(data.sizeKB, settings.unit)));
  }
  el.appendChild(detailRow('Visibility', data.isPrivate ? 'Private' : 'Public'));
  if (data.defaultBranch) {
    el.appendChild(detailRow('Default branch', data.defaultBranch));
  }
  if (data.stargazers !== null) {
    el.appendChild(detailRow('Stars', data.stargazers.toLocaleString()));
  }
  el.appendChild(
    detailRow(
      'Updated',
      `${formatRelativeTime(data.fetchedAt)}${data.fromCache ? ' (cached)' : ''}`,
    ),
  );

  const note = div('reposize-popover__note');
  note.textContent =
    'Includes packed .git history, a downloaded source ZIP is usually smaller.';
  el.appendChild(note);

  el.appendChild(buildActions());
}

function buildErrorPopover(el: HTMLElement, error: ApiError): void {
  const titleRow = div('reposize-popover__title');
  titleRow.append(span(undefined, 'Size unavailable'));
  el.appendChild(titleRow);

  const msg = div('reposize-popover__row');
  const msgText = span(undefined, error.message);
  msgText.style.color = 'var(--fgColor-danger, var(--color-danger-fg, #cf222e))';
  msg.appendChild(msgText);
  el.appendChild(msg);

  if (error.kind === 'RATE_LIMIT' && !error.hasToken) {
    const hint = div('reposize-popover__note');
    hint.textContent = 'Add a Personal Access Token in settings to raise the limit.';
    el.appendChild(hint);
  }

  el.appendChild(buildActions());
}

function buildActions(): HTMLElement {
  const actions = div('reposize-popover__actions');

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'reposize-popover__btn';
  refresh.textContent = 'Refresh';
  refresh.onclick = () => {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    closePopover();
    handlers.onRefresh();
  };

  const settingsLink = document.createElement('a');
  settingsLink.className = 'reposize-popover__link';
  settingsLink.href = '#';
  settingsLink.textContent = 'Settings';
  settingsLink.onclick = (e) => {
    e.preventDefault();
    closePopover();
    handlers.onOpenOptions();
  };

  actions.append(refresh, settingsLink);
  return actions;
}

// Small DOM helpers ------------------------------------------------------

function div(className?: string): HTMLElement {
  const el = document.createElement('div');
  if (className) el.className = className;
  return el;
}

function span(className: string | undefined, text: string): HTMLElement {
  const el = document.createElement('span');
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function detailRow(label: string, value: string): HTMLElement {
  const row = div('reposize-popover__row');
  row.append(span(undefined, label), span(undefined, value));
  return row;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activePositions(settings: Settings): { header: boolean; about: boolean } {
  return {
    header: settings.displayPosition === 'header' || settings.displayPosition === 'both',
    about: settings.displayPosition === 'about' || settings.displayPosition === 'both',
  };
}

function buildTitle(data: RepoSizeData, settings: Settings, level: WarningLevel): string {
  const size = formatSize(data.sizeKB, settings.unit);
  const prefix =
    level === 'danger'
      ? '⚠ Very large repository'
      : level === 'warning'
        ? '⚠ Large repository'
        : 'Repository size';
  return `${prefix}: ${size}${data.fromCache ? ' (cached)' : ''} — click for details`;
}
