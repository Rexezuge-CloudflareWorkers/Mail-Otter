import { createProviderApiError } from './BaseProviderHttp';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  trashed?: boolean;
  modifiedTime?: string;
}

interface DriveChangeItem {
  fileId?: string;
  removed?: boolean;
  file?: DriveFile;
}

interface DriveChangesResult {
  files: DriveFile[];
  removed: string[];
  nextPageToken: string | null;
  newStartPageToken: string | null;
}

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

const EXPORTABLE_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
]);

const DOWNLOADABLE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

interface DriveChangesApiResponse {
  nextPageToken?: string;
  newStartPageToken?: string;
  changes?: DriveChangeItem[];
}

function processChange(
  change: DriveChangeItem,
  files: DriveFile[],
  removed: string[],
): DriveFile | null {
  if (!change.fileId) return null;
  if (change.removed) {
    removed.push(change.fileId);
    return null;
  }
  const file = change.file;
  if (!file || file.trashed) return null;
  if (EXPORTABLE_MIME_TYPES.has(file.mimeType) || DOWNLOADABLE_MIME_TYPES.has(file.mimeType)) {
    files.push(file);
    return file;
  }
  return null;
}

class GoogleDriveProviderUtil {
  public static isSupportedMimeType(mimeType: string): boolean {
    return EXPORTABLE_MIME_TYPES.has(mimeType) || DOWNLOADABLE_MIME_TYPES.has(mimeType);
  }

  public static isExportableMimeType(mimeType: string): boolean {
    return EXPORTABLE_MIME_TYPES.has(mimeType);
  }

  public static async getStartPageToken(accessToken: string): Promise<string> {
    const url = `${GOOGLE_DRIVE_API}/changes/startPageToken`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw createProviderApiError('Google Drive', 'get start page token', response, await response.text());
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data: { startPageToken?: string } = await response.json();
    if (!data.startPageToken) throw new Error('Google Drive did not return a start page token.');
    return data.startPageToken;
  }

  public static async listChanges(
    accessToken: string,
    pageToken: string,
    maxFiles: number,
  ): Promise<DriveChangesResult> {
    const files: DriveFile[] = [];
    const removed: string[] = [];
    let currentToken = pageToken;
    let nextPageToken: string | null = null;
    let newStartPageToken: string | null = null;

    while (true) {
      const params = new URLSearchParams({
        pageToken: currentToken,
        fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,trashed,modifiedTime))',
        pageSize: '100',
        spaces: 'drive',
        includeRemoved: 'true',
      });
      const url = `${GOOGLE_DRIVE_API}/changes?${params}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw createProviderApiError('Google Drive', 'list changes', response, await response.text());
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data: DriveChangesApiResponse = await response.json();

      const changes: DriveChangeItem[] = data.changes ?? [];
      let hitMax = false;
      for (let i = 0; !hitMax && i < changes.length; i++) {
        processChange(changes[i], files, removed);
        if (files.length >= maxFiles) {
          nextPageToken = data.nextPageToken ?? null;
          if (!nextPageToken) newStartPageToken = data.newStartPageToken ?? null;
          hitMax = true;
        }
      }
      if (hitMax) return { files, removed, nextPageToken, newStartPageToken };

      if (data.nextPageToken) {
        currentToken = data.nextPageToken;
      } else {
        newStartPageToken = data.newStartPageToken ?? null;
        break;
      }
    }

    return { files, removed, nextPageToken, newStartPageToken };
  }

  public static async exportDocument(accessToken: string, fileId: string): Promise<string> {
    const url = `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw createProviderApiError('Google Drive', 'export document', response, await response.text());
    }
    return response.text();
  }

  public static async downloadFile(
    accessToken: string,
    fileId: string,
    maxBytes: number,
  ): Promise<ArrayBuffer> {
    const url = `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw createProviderApiError('Google Drive', 'download file', response, await response.text());
    }
    const buffer = await response.arrayBuffer();
    return buffer.slice(0, maxBytes);
  }
}

export { GoogleDriveProviderUtil };
export type { DriveFile, DriveChangesResult };
