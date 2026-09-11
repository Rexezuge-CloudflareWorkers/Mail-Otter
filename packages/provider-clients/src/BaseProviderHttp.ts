import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-otter/backend-errors';
import { FetchHttpClient, HttpFetchError, type IHttpClient } from './http/HttpClient';

const defaultHttpClient: IHttpClient = new FetchHttpClient();

async function fetchJsonWithBearer<T>(
  url: string,
  accessToken: string,
  providerName: string,
  init: RequestInit = {},
  client: IHttpClient = defaultHttpClient,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    return (await client.fetchJson(url, { ...init, headers })) as T;
  } catch (error) {
    if (error instanceof HttpFetchError) {
      throw createProviderApiErrorFromStatus(
        providerName,
        'request',
        error.status,
        error.statusText,
        extractErrorDetail(error.body, error.statusText),
      );
    }
    throw error;
  }
}

function extractErrorDetail(body: string, fallback: string): string {
  if (!body) return fallback;
  try {
    const data = JSON.parse(body) as { error?: { message?: string } };
    return data.error?.message || body;
  } catch {
    return body;
  }
}

function createProviderApiError(providerName: string, operation: string, response: Response, detail: string): Error {
  return createProviderApiErrorFromStatus(providerName, operation, response.status, response.statusText, detail || response.statusText);
}

function createProviderApiErrorFromStatus(
  providerName: string,
  operation: string,
  status: number,
  statusText: string,
  detail: string,
): Error {
  const message: string = `${providerName} ${operation} failed (${status.toString()}): ${detail || statusText}`;
  return isRetryableHttpStatus(status) ? new ProviderApiRetryableError(message) : new ProviderApiNonRetryableError(message);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export { fetchJsonWithBearer, createProviderApiError, createProviderApiErrorFromStatus, isRetryableHttpStatus };
