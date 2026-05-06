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

export const providerMethod: Record<string, 'oauth2'> = {
  'google-gmail': 'oauth2',
  'microsoft-outlook': 'oauth2',
};
