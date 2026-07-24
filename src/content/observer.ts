// Change detection: GitHub navigates client-side without full reloads, so we
// funnel three cheap signals — a body MutationObserver, popstate, and a slow
// interval — into one debounced, idempotent `reconcile` call.

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
