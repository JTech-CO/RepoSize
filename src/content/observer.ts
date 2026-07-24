// Change detection for the content script.
//
// GitHub is a client-side-routed app (Turbo / React Router) that re-renders the
// header and swaps pages without a full reload. A content script lives in an
// isolated world, so it cannot patch the page's `history` object. We therefore
// combine three cheap signals into one debounced `reconcile` call:
//
//   1. A MutationObserver on <body> (childList/subtree) — fires when GitHub
//      swaps page content or re-renders the header.
//   2. `popstate` — back/forward navigation.
//   3. A slow interval — a last-resort safety net for any missed transition.
//
// `reconcile` is expected to be idempotent and cheap: it compares the URL and
// ensures the badge is present, writing to the DOM only when something changed.

export function startWatching(reconcile: () => void): void {
  const debounced = debounce(reconcile, 150);

  const observer = new MutationObserver(debounced);
  const observeTarget = document.body ?? document.documentElement;
  observer.observe(observeTarget, { childList: true, subtree: true });

  window.addEventListener('popstate', () => debounced());

  // Safety net for transitions that mutate nothing we observe (rare).
  window.setInterval(reconcile, 1500);
}

function debounce(fn: () => void, waitMs: number): () => void {
  let timer: number | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(fn, waitMs);
  };
}
