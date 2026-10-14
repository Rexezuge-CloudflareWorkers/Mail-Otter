import { useTranslation } from 'react-i18next';
import { useNotice as useKitNotice } from '@rexezuge/web';
import type { Notice } from '@rexezuge/web';

type TranslateFn = (key: string, defaultValue: string) => string;

/**
 * The notice an OAuth redirect leaves behind, read out of the query string.
 *
 * `GET /api/oauth2/callback` redirects back here with `?oauth2=connected` or
 * `?oauth2=error&message=…`, so the result of a consent flow survives the trip
 * without server state. That is this repo's routing, so it stays here; the
 * banner and the timer are the kit's.
 */
function oauthNoticeFromUrl(t: TranslateFn): Notice | null {
  const params = new URLSearchParams(location.search);
  if (params.get('oauth2') === 'connected') {
    return { kind: 'success', message: t('toasts.oauthComplete', 'OAuth2 Connection Completed.') };
  }
  if (params.get('oauth2') === 'error') {
    // The provider's own message when there is one: "access_denied" tells the
    // user more than a generic failure, and the caller put it in the URL.
    return { kind: 'error', message: params.get('message') || t('toasts.oauthFailed', 'OAuth2 Connection Failed.') };
  }
  return null;
}

/**
 * Transient status notices.
 *
 * The banner, the auto-dismiss timer and the replacement semantics are
 * `@rexezuge/web`'s, converged from six copies of this hook and six of the
 * banner it feeds. What stays local is the URL seeding above and nothing else.
 *
 * The field rename the adoption costs — `{ type, text }` became
 * `{ kind, message }` — is what makes the hook and the banner compose
 * directly. Before, every copy of the banner took one shape and every copy of
 * the hook produced the other, so each call site shuffled the fields to feed a
 * component the hook had already produced.
 */
export function useNotice() {
  const { t } = useTranslation();
  return useKitNotice({ initial: oauthNoticeFromUrl(t) });
}
