import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchHttpClient, HttpFetchError, StubHttpClient } from '../../packages/provider-clients/src/http/HttpClient';

function jsonResponse(body: unknown, overrides?: { ok?: boolean; status?: number; statusText?: string }): Response {
  return {
    ok: overrides?.ok ?? true,
    status: overrides?.status ?? 200,
    statusText: overrides?.statusText ?? 'OK',
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('FetchHttpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed JSON for an OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ labelId: 'abc123' }));
    const client = new FetchHttpClient();

    await expect(client.fetchJson('https://example.com/api')).resolves.toEqual({ labelId: 'abc123' });
  });

  it('returns an empty object for an OK response with an empty body', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(''));
    const client = new FetchHttpClient();

    await expect(client.fetchJson('https://example.com/api')).resolves.toEqual({});
  });

  it('forwards init options to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    global.fetch = fetchMock;
    const client = new FetchHttpClient();

    await client.fetchJson('https://example.com/api', { method: 'POST', body: '{}' });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api', { method: 'POST', body: '{}' });
  });

  it('throws HttpFetchError with status and body for non-OK responses', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('quota exceeded', { ok: false, status: 429, statusText: 'Too Many Requests' }));
    const client = new FetchHttpClient();

    const error = await client.fetchJson('https://example.com/api').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpFetchError);
    const fetchError = error as HttpFetchError;
    expect(fetchError.status).toBe(429);
    expect(fetchError.body).toBe('quota exceeded');
    expect(fetchError.message).toContain('429');
  });

  it('propagates network errors without wrapping them', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));
    const client = new FetchHttpClient();

    await expect(client.fetchJson('https://example.com/api')).rejects.toThrow('Network unreachable');
  });
});

describe('StubHttpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays queued JSON values in order and records calls', async () => {
    const client = new StubHttpClient().queueJson({ id: '1' }).queueJson({ id: '2' });

    await expect(client.fetchJson('https://example.com/first')).resolves.toEqual({ id: '1' });
    await expect(client.fetchJson('https://example.com/second', { method: 'POST' })).resolves.toEqual({ id: '2' });
    expect(client.calls).toEqual([
      { url: 'https://example.com/first', init: undefined },
      { url: 'https://example.com/second', init: { method: 'POST' } },
    ]);
  });

  it('throws queued errors', async () => {
    const client = new StubHttpClient().queueError(new HttpFetchError(503, 'Service Unavailable', 'down'));

    await expect(client.fetchJson('https://example.com/api')).rejects.toBeInstanceOf(HttpFetchError);
  });

  it('delegates to the handler when one is set', async () => {
    const handler = vi.fn().mockReturnValue({ handled: true });
    const client = new StubHttpClient(handler);

    await expect(client.fetchJson('https://example.com/api')).resolves.toEqual({ handled: true });
    expect(handler).toHaveBeenCalledWith('https://example.com/api', undefined);
    expect(client.calls).toHaveLength(1);
  });

  it('throws when no response is queued and no handler is set', async () => {
    const client = new StubHttpClient();

    await expect(client.fetchJson('https://example.com/api')).rejects.toThrow('no queued response');
  });
});
