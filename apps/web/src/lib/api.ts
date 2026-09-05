const D1_BOOKMARK_HEADER: string = 'x-d1-bookmark';

let latestD1Bookmark: string | undefined;

export async function apiFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const isUserRequest: boolean = getFetchPath(input).startsWith('/user/');
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (isUserRequest && latestD1Bookmark && !headers.has(D1_BOOKMARK_HEADER)) {
    headers.set(D1_BOOKMARK_HEADER, latestD1Bookmark);
  }

  const response: Response = await fetch(input, isUserRequest ? { ...init, headers } : init);
  if (isUserRequest) {
    rememberD1Bookmark(response.headers.get(D1_BOOKMARK_HEADER));
  }
  return response;
}

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  return response.json();
}

function buildQuery(params: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) p.append(key, v);
    } else {
      p.set(key, value);
    }
  }
  return p.toString();
}

export async function apiGet<T>(path: string, params?: Record<string, string | string[] | undefined>): Promise<T> {
  const qs = params ? buildQuery(params) : '';
  return readJson<T>(await apiFetch(qs ? `${path}?${qs}` : path));
}

export async function apiPost<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  return readJson<T>(
    await apiFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiPost<T>(path, body, 'PUT');
}

export async function apiDelete<T>(path: string, body: unknown): Promise<T> {
  return apiPost<T>(path, body, 'DELETE');
}

export async function fetchDocumentAuditLogs(
  contextDocumentId: string,
  cursor?: string,
): Promise<{ logs: import('../types').ContextAuditLog[]; nextCursor?: string | null }> {
  return apiGet<{ logs: import('../types').ContextAuditLog[]; nextCursor?: string | null }>(
    `/user/application/context/document/${encodeURIComponent(contextDocumentId)}/logs`,
    cursor ? { cursor } : undefined,
  );
}

function getFetchPath(input: Parameters<typeof fetch>[0]): string {
  const url: string = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  return new URL(url, globalThis.location.origin).pathname;
}

function rememberD1Bookmark(bookmark: string | null): void {
  const nextBookmark: string | undefined = bookmark?.trim() || undefined;
  if (!nextBookmark) return;
  if (!latestD1Bookmark || latestD1Bookmark < nextBookmark) {
    // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
    latestD1Bookmark = nextBookmark;
  }
}
