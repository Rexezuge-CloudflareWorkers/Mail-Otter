import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NOTICE_TIMEOUT_MS } from '../lib/constants';

type TranslateFn = (key: string, defaultValue: string) => string;

function getInitialNotice(t: TranslateFn): { type: 'success' | 'error'; text: string } | null {
  const params = new URLSearchParams(globalThis.location.search);
  if (params.get('oauth2') === 'connected') return { type: 'success', text: t('toasts.oauthComplete', 'OAuth2 Connection Completed.') };
  if (params.get('oauth2') === 'error') return { type: 'error', text: params.get('message') || t('toasts.oauthFailed', 'OAuth2 Connection Failed.') };
  return null;
}

export function useNotice() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(() => getInitialNotice(t));
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
