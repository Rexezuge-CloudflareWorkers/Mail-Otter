import { ErrorSanitizationUtil } from './ErrorSanitizationUtil';

/**
 * Redacted error logging.
 *
 * Provider SDKs and OAuth endpoints put credentials in error messages: a
 * `fetch` failure can carry `access_token=…` in the URL, a Graph 401 can echo
 * the `Authorization: Bearer …` header, and Gmail errors embed the full
 * request. Passing those straight to `console.*` writes live secrets into
 * Workers logs, where they are retained far longer than the request that
 * produced them.
 *
 * `ErrorSanitizationUtil` is the masker. CodeQL's `js/clear-text-logging`
 * query does not model `String#replaceAll` with a wildcard pattern as a
 * masking barrier, so it will still flag these calls. That is a false positive
 * here and is the reason token-adjacent callers in `apps/background` follow a
 * stricter rule instead: see `logTokenAdjacentError` below.
 */

/**
Log an error with any credential-shaped substrings replaced.
*/
const logError = (level: 'warn' | 'error', message: string, error?: unknown): void => {
  const sanitized: string = ErrorSanitizationUtil.sanitizeErrorForLogging(error ?? '');
  console[level](`${message}${sanitized ? `: ${sanitized}` : ''}`);
};

/**
 * Log an error from a path that handles OAuth2 tokens or other credentials.
 *
 * Prefer this over `logError` wherever the caught value may transitively carry
 * a token. It does not interpolate the error at all — only a caller-supplied
 * message and the opaque identifiers the caller already knows are safe
 * (application/subscription/message IDs) — which is both what the CodeQL rule
 * is trying to enforce and what the background-worker guidelines require.
 *
 * The error itself is intentionally dropped. Losing the cause is a real cost,
 * so pair this with a persisted failure record (e.g. `BackgroundTaskRunDAO`
 * or `OAuth2AccessTokenRefreshStatusDAO`) that the support flow can read.
 */
const logTokenAdjacentError = (level: 'warn' | 'error', message: string, identifiers: Readonly<Record<string, string>> = {}): void => {
  const suffix: string = Object.entries(identifiers)
    .filter(([, value]: [string, string]): boolean => Boolean(value))
    .map(([key, value]: [string, string]): string => `${key}=${value}`)
    .join(' ');
  console[level](suffix ? `${message} (${suffix})` : message);
};

export { logError, logTokenAdjacentError };
