import { useEffect } from 'react';

/**
 * Reads a URL search param synchronously from window.location.search.
 * Call this inside useState lazy initializers so it runs before the first render.
 */
export function getUrlParam(key: string, defaultValue: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) || defaultValue;
}

/**
 * Syncs a record of key/value pairs into the URL search string via
 * history.replaceState on every render. Empty values are omitted.
 *
 * Uses replaceState (not pushState) intentionally — filter changes and view
 * switches do not create browser history entries.
 */
export function useSyncedUrl(params: Record<string, string>): void {
  useEffect(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    const query = sp.toString();
    const next = query ? `?${query}` : window.location.pathname;
    const current = window.location.search || '';
    if (current !== (query ? `?${query}` : '')) {
      history.replaceState(null, '', next);
    }
  });
}
