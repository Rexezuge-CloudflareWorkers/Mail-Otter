import { createProviderApiError } from './BaseProviderHttp';

interface OneDriveFileInfo {
  mimeType?: string;
}

interface OneDriveDeletedInfo {
  state?: string;
}

interface OneDriveItem {
  id: string;
  name: string;
  size?: number;
  file?: OneDriveFileInfo;
  deleted?: OneDriveDeletedInfo;
  lastModifiedDateTime?: string;
  '@microsoft.graph.downloadUrl'?: string;
}

interface OneDriveDeltaResult {
  items: OneDriveItem[];
  deletedIds: string[];
  nextLink: string | null;
  deltaLink: string | null;
}

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

const SUPPORTED_ONEDRIVE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function isSupportedByExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.pptx') ||
    lower.endsWith('.xlsx')
  );
}

interface OneDriveDeltaApiResponse {
  value?: OneDriveItem[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

function classifyDeltaItem(
  item: OneDriveItem,
  items: OneDriveItem[],
  deletedIds: string[],
): 'supported' | 'deleted' | 'skipped' {
  if (item.deleted) {
    deletedIds.push(item.id);
    return 'deleted';
  }
  if (item.file && (SUPPORTED_ONEDRIVE_MIME_TYPES.has(item.file.mimeType ?? '') || isSupportedByExtension(item.name))) {
    items.push(item);
    return 'supported';
  }
  return 'skipped';
}

class OneDriveProviderUtil {
  public static isSupportedItem(item: OneDriveItem): boolean {
    if (!item.file) return false;
    const mimeType = item.file.mimeType ?? '';
    if (SUPPORTED_ONEDRIVE_MIME_TYPES.has(mimeType)) return true;
    return isSupportedByExtension(item.name);
  }

  public static isOfficeDocument(item: OneDriveItem): boolean {
    const mimeType = item.file?.mimeType ?? '';
    const name = item.name.toLowerCase();
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      name.endsWith('.docx') ||
      name.endsWith('.pptx') ||
      name.endsWith('.xlsx')
    );
  }

  public static async getDelta(
    accessToken: string,
    deltaOrNextLink?: string,
    maxItems = 100,
  ): Promise<OneDriveDeltaResult> {
    const items: OneDriveItem[] = [];
    const deletedIds: string[] = [];

    const initialUrl =
      deltaOrNextLink ??
      `${GRAPH_API}/me/drive/root/delta?$select=id,name,size,file,deleted,lastModifiedDateTime`;

    let currentUrl: string | null = initialUrl;
    let nextLink: string | null = null;
    let deltaLink: string | null = null;

    while (currentUrl) {
      const response = await fetch(currentUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw createProviderApiError('Microsoft Graph (OneDrive)', 'get delta', response, await response.text());
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data: OneDriveDeltaApiResponse = await response.json();

      const pageItems: OneDriveItem[] = data.value ?? [];
      let hitMax = false;
      for (let i = 0; !hitMax && i < pageItems.length; i++) {
        classifyDeltaItem(pageItems[i], items, deletedIds);
        if (items.length >= maxItems) {
          nextLink = data['@odata.nextLink'] ?? null;
          if (!nextLink) deltaLink = data['@odata.deltaLink'] ?? null;
          hitMax = true;
        }
      }
      if (hitMax) return { items, deletedIds, nextLink, deltaLink };

      nextLink = data['@odata.nextLink'] ?? null;
      deltaLink = data['@odata.deltaLink'] ?? null;
      currentUrl = nextLink;
    }

    return { items, deletedIds, nextLink: null, deltaLink };
  }

  public static async downloadItem(downloadUrl: string, maxBytes: number): Promise<ArrayBuffer> {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw createProviderApiError('Microsoft Graph (OneDrive)', 'download item', response, await response.text());
    }
    const buffer = await response.arrayBuffer();
    return buffer.slice(0, maxBytes);
  }

  public static async convertItemToPdf(
    accessToken: string,
    itemId: string,
    maxBytes: number,
  ): Promise<ArrayBuffer> {
    const url = `${GRAPH_API}/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw createProviderApiError('Microsoft Graph (OneDrive)', 'convert item to PDF', response, await response.text());
    }
    const buffer = await response.arrayBuffer();
    return buffer.slice(0, maxBytes);
  }
}

export { OneDriveProviderUtil };
export type { OneDriveItem, OneDriveDeltaResult };
