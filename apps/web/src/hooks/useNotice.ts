import { useCallback, useRef, useState } from 'react';
import { NOTICE_TIMEOUT_MS } from '../lib/constants';

function getInitialNotice(): { type: 'success' | 'error'; text: string } | null {
  const params = new URLSearchParams(globalThis.location.search);
  if (params.get('oauth2') === 'connected') return { type: 'success', text: 'OAuth2 Connection Completed.' };
  if (params.get('oauth2') === 'error') return { type: 'error', text: params.get('message') || 'OAuth2 Connection Failed.' };
  return null;
}

export function useNotice() {
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(() => getInitialNotice());
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setNotice({ type, text });
    timerRef.current = setTimeout(() => {
      setNotice(null);
      timerRef.current = null;
    }, NOTICE_TIMEOUT_MS);
  }, []);

  return { notice, showNotice };
}
