import { PROVIDER_CONFIG_KEY_GOOGLE_DRIVE_PAGE_TOKEN } from '@mail-otter/backend-data/constants';
import { GoogleDriveProviderUtil } from '@mail-otter/provider-clients/google-drive';
import type { DriveFile } from '@mail-otter/provider-clients/google-drive';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE } from '@mail-otter/shared/constants';
import { AbstractDriveIngestionService } from './AbstractDriveIngestionService';
import type {
  DriveBootstrap,
  DriveChangeSet,
  DriveExtractedDocument,
  DriveFetchDeps,
  DriveIngestionEnv,
  DriveIngestionResult,
} from './AbstractDriveIngestionService';
import { DriveDocumentUtil } from './DriveDocumentUtil';

type GoogleDriveIngestionEnv = DriveIngestionEnv;

class GoogleDriveIngestionService extends AbstractDriveIngestionService<DriveFile> {
  protected readonly driveCursorKey = PROVIDER_CONFIG_KEY_GOOGLE_DRIVE_PAGE_TOKEN;
  protected readonly driveSourceType = CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE;
  protected readonly driveLogPrefix = '[GoogleDriveIngestionService]';

  constructor(env: DriveIngestionEnv) {
    super(env);
  }

  public async ingestForApplication(application: ConnectedApplication, accessToken: string): Promise<DriveIngestionResult> {
    return this.ingestForApplicationTemplate(application, accessToken);
  }

  protected async fetchChanges(
    accessToken: string,
    storedCursor: string | null,
    maxFiles: number,
    _deps: DriveFetchDeps,
  ): Promise<DriveChangeSet<DriveFile> | DriveBootstrap> {
    if (!storedCursor) {
      const freshToken = await GoogleDriveProviderUtil.getStartPageToken(accessToken);
      return { bootstrapped: true, bootstrapCursor: freshToken };
    }
    const changes = await GoogleDriveProviderUtil.listChanges(accessToken, storedCursor, maxFiles);
    return {
      removedIds: changes.removed,
      items: changes.files,
      newCursor: changes.newStartPageToken ?? changes.nextPageToken,
    };
  }

  protected async extractText(accessToken: string, file: DriveFile, maxBytes: number): Promise<DriveExtractedDocument | null> {
    if (file.size !== undefined && Number(file.size) > maxBytes) {
      return null;
    }

    let rawText: string | null = null;
    if (GoogleDriveProviderUtil.isExportableMimeType(file.mimeType)) {
      rawText = await GoogleDriveProviderUtil.exportDocument(accessToken, file.id);
    } else {
      const buffer = await GoogleDriveProviderUtil.downloadFile(accessToken, file.id, maxBytes);
      rawText = DriveDocumentUtil.extractText(buffer, file.mimeType);
    }

    if (!rawText || rawText.trim().length === 0) {
      return null;
    }
    return { sourceDocumentId: file.id, title: file.name, rawText };
  }
}

export { GoogleDriveIngestionService };
export type { GoogleDriveIngestionEnv };
export type { DriveIngestionResult } from './AbstractDriveIngestionService';
