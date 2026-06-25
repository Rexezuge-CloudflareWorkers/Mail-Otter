import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-otter/backend-errors';

async function fetchJsonWithBearer<T>(
  url: string,
  accessToken: string,
  providerName: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response: Response = await fetch(url, { ...init, headers });
  const text: string = await response.text();
  const data = text
    ? (JSON.parse(text) as T & { error?: { message?: string } })
    : ({} as T & { error?: { message?: string } });
  if (!response.ok) {
    throw createProviderApiError(providerName, 'request', response, data.error?.message || text || response.statusText);
  }
  return data;
}

function createProviderApiError(providerName: string, operation: string, response: Response, detail: string): Error {
  const message: string = `${providerName} ${operation} failed (${response.status}): ${detail || response.statusText}`;
  return isRetryableHttpStatus(response.status)
    ? new ProviderApiRetryableError(message)
    : new ProviderApiNonRetryableError(message);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export { fetchJsonWithBearer, createProviderApiError, isRetryableHttpStatus };
