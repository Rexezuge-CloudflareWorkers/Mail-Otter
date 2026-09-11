import { PROVIDER_CONFIG_KEY_ONEDRIVE_DELTA_LINK } from '@mail-otter/backend-data/constants';
import { OneDriveProviderUtil } from '@mail-otter/provider-clients/onedrive';
import type { OneDriveItem } from '@mail-otter/provider-clients/onedrive';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { CONTEXT_SOURCE_TYPE_ONEDRIVE } from '@mail-otter/shared/constants';
import { UnauthorizedError } from '@mail-otter/backend-errors';
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

type OneDriveIngestionEnv = DriveIngestionEnv;

class OneDriveIngestionService extends AbstractDriveIngestionService<OneDriveItem> {
  protected readonly driveCursorKey = PROVIDER_CONFIG_KEY_ONEDRIVE_DELTA_LINK;
  protected readonly driveSourceType = CONTEXT_SOURCE_TYPE_ONEDRIVE;
  protected readonly driveLogPrefix = '[OneDriveIngestionService]';

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
    deps: DriveFetchDeps,
  ): Promise<DriveChangeSet<OneDriveItem> | DriveBootstrap> {
    const { application, applicationDAO } = deps;
    let delta: Awaited<ReturnType<typeof OneDriveProviderUtil.getDelta>>;
    try {
      delta = await OneDriveProviderUtil.getDelta(accessToken, storedCursor ?? undefined, maxFiles);
    } catch (error: unknown) {
      const is401 = error instanceof Error && error.message.includes('(401)');
      if (is401 && storedCursor) {
        // Stale delta link — clear it and retry from the beginning
        await applicationDAO.deleteProviderConfig(application.applicationId, this.driveCursorKey);
        try {
          delta = await OneDriveProviderUtil.getDelta(accessToken, undefined, maxFiles);
        } catch (retryError: unknown) {
          if (retryError instanceof Error && retryError.message.includes('(401)')) {
            throw new UnauthorizedError(
              'OneDrive access token lacks the required scope. Re-authorize the application with OneDrive permissions enabled.',
            );
          }
          throw retryError;
        }
      } else if (is401) {
        throw new UnauthorizedError(
          'OneDrive access token lacks the required scope. Re-authorize the application with OneDrive permissions enabled.',
        );
      } else {
        throw error;
      }
    }

    return {
      removedIds: delta.deletedIds,
      items: delta.items,
      newCursor: delta.deltaLink ?? delta.nextLink,
    };
  }

  protected async extractText(accessToken: string, item: OneDriveItem, maxBytes: number): Promise<DriveExtractedDocument | null> {
    if (item.size !== undefined && item.size > maxBytes) {
      return null;
    }

    let rawText: string | null = null;

    if (OneDriveProviderUtil.isOfficeDocument(item)) {
      try {
        const pdfBuffer = await OneDriveProviderUtil.convertItemToPdf(accessToken, item.id, maxBytes);
        rawText = DriveDocumentUtil.extractText(pdfBuffer, 'application/pdf');
      } catch {
        // Conversion failed — skip this file
        return null;
      }
    } else {
      const downloadUrl = item['@microsoft.graph.downloadUrl'];
      if (!downloadUrl) return null;
      const mimeType = item.file?.mimeType ?? 'text/plain';
      const buffer = await OneDriveProviderUtil.downloadItem(downloadUrl, maxBytes);
      rawText = DriveDocumentUtil.extractText(buffer, mimeType);
    }

    if (!rawText || rawText.trim().length === 0) {
      return null;
    }
    return { sourceDocumentId: item.id, title: item.name, rawText };
  }
}

export { OneDriveIngestionService };
export type { OneDriveIngestionEnv };
