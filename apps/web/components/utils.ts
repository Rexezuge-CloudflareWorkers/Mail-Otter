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
  return response.json() as Promise<T>;
}

export function formatTimestamp(timestampSeconds: number | null | undefined): string {
  if (timestampSeconds === null || timestampSeconds === undefined) return 'Never';
  const date = new Date(timestampSeconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatExpiryTimestamp(timestampSeconds: number | null | undefined): string {
  if (timestampSeconds === null || timestampSeconds === undefined) return 'Never';
  const date = new Date(timestampSeconds * 1000);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Expires soon';
  if (diffMins < 60) return `Expires in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Expires in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Expires in ${diffDays}d`;
  if (diffDays < 30) return `Expires in ${diffDays}d`;
  return `Expires ${date.toLocaleDateString()}`;
}

export const methodLabels: Record<string, string> = {
  oauth2: 'OAuth2',
};

export const providerLabels: Record<string, string> = {
  'google-gmail': 'Google Gmail',
  'microsoft-outlook': 'Microsoft Outlook',
};

export async function fetchDocumentAuditLogs(contextDocumentId: string, cursor?: string): Promise<{ logs: import('./types').ContextAuditLog[]; nextCursor?: string | null }> {
  let url = `/user/application/context/document/${encodeURIComponent(contextDocumentId)}/logs`;
  if (cursor) url += `?cursor=${encodeURIComponent(cursor)}`;
  return readJson<{ logs: import('./types').ContextAuditLog[]; nextCursor?: string | null }>(await apiFetch(url));
}

export const providerMethod: Record<string, 'oauth2'> = {
  'google-gmail': 'oauth2',
  'microsoft-outlook': 'oauth2',
};

function getFetchPath(input: Parameters<typeof fetch>[0]): string {
  const url: string = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  return new URL(url, window.location.origin).pathname;
}

function rememberD1Bookmark(bookmark: string | null): void {
  const nextBookmark: string | undefined = bookmark?.trim() || undefined;
  if (!nextBookmark) return;
  if (!latestD1Bookmark || latestD1Bookmark < nextBookmark) {
    latestD1Bookmark = nextBookmark;
  }
}
