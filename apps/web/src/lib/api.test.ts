import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiFetch, apiGet, apiPost, apiPut, readJson, resetD1Bookmark } from '@/lib/api';
import { formatNumberLocale, resolveLocale } from '@/lib/locale';
import { LANGUAGE_STORAGE_KEY } from '@/i18n';

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  // `init` may carry its own headers (e.g. the D1 bookmark), so the status and
  // content type are defaults rather than fixed.
  Response.json(body, { status: 200, ...init });

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // The bookmark cache is module state that intentionally outlives a request;
    // without this reset it leaks between tests in this file.
    resetD1Bookmark();
    // A fresh Response per call: a Response body can only be read once.
    fetchMock = vi.fn().mockImplementation((): Promise<Response> => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /*
   * `RequestInit.body` is a `BodyInit`; these tests only ever send JSON, so the
   * narrowing cast is sound.
   */
  const bodyText = (): string => lastInit()?.body as string;

  const lastInit = (): RequestInit | undefined => {
    const calls = fetchMock.mock.calls;
    return calls[calls.length - 1]?.[1] as RequestInit | undefined;
  };
  const headerOf = (init: RequestInit | undefined, name: string): string | null => {
    const headers = init?.headers;
    if (!headers) return null;
    if (headers instanceof Headers) return headers.get(name);
    // Covers both the tuple and record forms of `HeadersInit`.
    return new Headers(headers).get(name);
  };

  describe('readJson', () => {
    it('parses a successful response', async () => {
      await expect(readJson(jsonResponse({ value: 1 }))).resolves.toEqual({ value: 1 });
    });

    it('throws the response body as the error message', async () => {
      await expect(readJson(new Response('boom', { status: 400 }))).rejects.toThrow('boom');
    });

    it('falls back to the status when the error body is empty', async () => {
      await expect(readJson(new Response('', { status: 500 }))).rejects.toThrow('HTTP 500');
    });
  });

  describe('query building', () => {
    it('appends params and omits undefined and empty values', async () => {
      await apiGet('/user/actions', { status: 'pending', cursor: undefined, applicationId: '', limit: '10' });
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('status=pending');
      expect(url).toContain('limit=10');
      expect(url).not.toContain('cursor');
      expect(url).not.toContain('applicationId');
    });

    it('repeats a key for each array value', async () => {
      await apiGet('/user/activity', { types: ['action_created', 'action_executed'] });
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url.match(/types=/g)).toHaveLength(2);
      expect(url).toContain('types=action_created');
      expect(url).toContain('types=action_executed');
    });

    it('omits the question mark when there are no params', async () => {
      await apiGet('/user/applications');
      expect(String(fetchMock.mock.calls[0][0])).toBe('/user/applications');
    });
  });

  describe('request bodies', () => {
    it('sends JSON for a POST', async () => {
      await apiPost('/user/chat', { query: 'hi' });
      const init = lastInit();
      expect(init?.method).toBe('POST');
      expect(bodyText()).toBe('{"query":"hi"}');
      expect(headerOf(init, 'Content-Type')).toBe('application/json');
    });

    it('sends no body when one is not supplied', async () => {
      await apiPost('/user/application/integration/test');
      expect(lastInit()?.body).toBeUndefined();
    });

    it('uses the right verb for PUT and DELETE', async () => {
      await apiPut('/user/me', { preferredLanguage: 'de' });
      expect(lastInit()?.method).toBe('PUT');
      await apiDelete('/user/application/integration', { integrationId: 'x' });
      expect(lastInit()?.method).toBe('DELETE');
    });
  });

  describe('D1 bookmark handling', () => {
    it('sends the bookmark back on subsequent user requests', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { headers: { 'x-d1-bookmark': 'bookmark-2' } }));
      await apiFetch('/user/me');
      expect(headerOf(fetchMock.mock.calls[0]?.[1] as RequestInit | undefined, 'x-d1-bookmark')).toBeNull();

      await apiFetch('/user/applications');
      expect(headerOf(lastInit(), 'x-d1-bookmark')).toBe('bookmark-2');
    });

    it('never attaches the bookmark to a public request', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { headers: { 'x-d1-bookmark': 'bookmark-2' } }));
      await apiFetch('/user/me');
      await apiFetch('/api/actions/action-1');
      expect(headerOf(lastInit(), 'x-d1-bookmark')).toBeNull();
    });

    it('keeps the newest bookmark rather than regressing', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { headers: { 'x-d1-bookmark': 'bookmark-5' } }));
      await apiFetch('/user/me');
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { headers: { 'x-d1-bookmark': 'bookmark-1' } }));
      await apiFetch('/user/me');

      // The stale 'bookmark-1' must not replace 'bookmark-5'.
      fetchMock.mockImplementation((): unknown => jsonResponse({}));
      await apiFetch('/user/applications');
      expect(headerOf(lastInit(), 'x-d1-bookmark')).toBe('bookmark-5');
    });

    it('ignores an empty bookmark header', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { headers: { 'x-d1-bookmark': ' '.repeat(3) } }));
      await apiFetch('/user/me');
      fetchMock.mockImplementation((): unknown => jsonResponse({}));
      await apiFetch('/user/applications');
      expect(headerOf(lastInit(), 'x-d1-bookmark')).toBeNull();
    });
  });
});

describe('locale resolution', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('prefers an explicit language', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(resolveLocale('de')).toBe('de');
  });

  it('falls back to the stored preference', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ja');
    expect(resolveLocale()).toBe('ja');
  });

  it('falls back to the browser language, then to English', () => {
    localStorage.clear();
    expect(resolveLocale()).toBe('en');
  });

  it('normalizes a regional tag to a supported locale', () => {
    localStorage.clear();
    expect(resolveLocale('de-AT')).toBe('de');
  });

  it('survives a localStorage that throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(resolveLocale()).toBe('en');
    getItem.mockRestore();
  });

  it('formats numbers for the resolved locale', () => {
    expect(formatNumberLocale(1234.5, 'de')).toBe((1234.5).toLocaleString('de'));
    expect(formatNumberLocale(1234.5, 'en', { maximumFractionDigits: 0 })).toBe('1,235');
  });
});
