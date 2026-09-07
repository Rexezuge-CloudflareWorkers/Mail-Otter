import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { OneDriveProviderUtil } from '@mail-otter/provider-clients/onedrive';
import type { OneDriveItem } from '@mail-otter/provider-clients/onedrive';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import {
  CONTEXT_SOURCE_TYPE_ONEDRIVE,
} from '@mail-otter/shared/constants';
import { UnauthorizedError } from '@mail-otter/backend-errors';
import { AbstractDriveIngestionService } from './AbstractDriveIngestionService';
import type { DriveIngestionEnv } from './AbstractDriveIngestionService';
import { DriveDocumentUtil } from './DriveDocumentUtil';
import type { DriveIngestionResult } from './GoogleDriveIngestionService';

interface OneDriveIngestionEnv extends DriveIngestionEnv {
  DB: D1Queryable;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: VectorizeIndex;
  AES_ENCRYPTION_KEY_SECRET: { get(): Promise<string> };
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_DRIVE_FILES_PER_SYNC?: string;
  AI_EMBEDDING_MODEL?: string;
  MAX_CONTEXT_MEMORY_CHARS?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
}

class OneDriveIngestionService extends AbstractDriveIngestionService {
  constructor(env: OneDriveIngestionEnv) {
    super(env);
  }

  public async ingestForApplication(
    application: ConnectedApplication,
    accessToken: string,
  ): Promise<DriveIngestionResult> {
    const ctx = await this.requireContext(application);
    if (ctx.skipped) {
      return { indexed: 0, skipped: 0, failed: 0, newCursor: null };
    }
    const { vectorNamespace, contextDAO, maxBytes, maxFiles } = ctx;
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);

    const storedLink = await applicationDAO.getProviderConfig(
      application.applicationId,
      'onedrive_delta_link',
    );

    let delta: Awaited<ReturnType<typeof OneDriveProviderUtil.getDelta>>;
    try {
      delta = await OneDriveProviderUtil.getDelta(accessToken, storedLink ?? undefined, maxFiles);
    } catch (error: unknown) {
      const is401 = error instanceof Error && error.message.includes('(401)');
      if (is401 && storedLink) {
        // Stale delta link — clear it and retry from the beginning
        await applicationDAO.deleteProviderConfig(application.applicationId, 'onedrive_delta_link');
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

    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    await this.deleteRemovedDocuments(
      contextDAO,
      application,
      delta.deletedIds,
      CONTEXT_SOURCE_TYPE_ONEDRIVE,
      '[OneDriveIngestionService]',
    );

    for (const item of delta.items) {
      try {
        const result = await this.ingestItem(
          application,
          accessToken,
          item,
          vectorNamespace,
          maxBytes,
        );
        if (result === 'indexed') indexed++;
        else if (result === 'skipped') skipped++;
      } catch (error: unknown) {
        failed++;
        console.warn(`[OneDriveIngestionService] Failed to ingest item ${item.id}:`, error);
        await this.markIngestError(contextDAO, application, item.id, CONTEXT_SOURCE_TYPE_ONEDRIVE, error);
      }
    }

    const newCursor = delta.deltaLink ?? delta.nextLink;
    if (newCursor) {
      await applicationDAO.setProviderConfig(
        application.applicationId,
        'onedrive_delta_link',
        newCursor,
      );
    }

    return { indexed, skipped, failed, newCursor };
  }

  private async ingestItem(
    application: ConnectedApplication,
    accessToken: string,
    item: OneDriveItem,
    vectorNamespace: string,
    maxBytes: number,
  ): Promise<'indexed' | 'skipped'> {
    if (item.size !== undefined && item.size > maxBytes) {
      return 'skipped';
    }

    let rawText: string | null = null;

    if (OneDriveProviderUtil.isOfficeDocument(item)) {
      try {
        const pdfBuffer = await OneDriveProviderUtil.convertItemToPdf(accessToken, item.id, maxBytes);
        rawText = DriveDocumentUtil.extractText(pdfBuffer, 'application/pdf');
      } catch {
        // Conversion failed — skip this file
        return 'skipped';
      }
    } else {
      const downloadUrl = item['@microsoft.graph.downloadUrl'];
      if (!downloadUrl) return 'skipped';
      const mimeType = item.file?.mimeType ?? 'text/plain';
      const buffer = await OneDriveProviderUtil.downloadItem(downloadUrl, maxBytes);
      rawText = DriveDocumentUtil.extractText(buffer, mimeType);
    }

    if (!rawText || rawText.trim().length === 0) {
      return 'skipped';
    }

    const indexedText = this.buildIndexedText(item.name, application.displayName, rawText);
    const ctx = await this.requireContext(application);
    if (ctx.skipped) return 'skipped';
    return this.ingestTextDocument(
      application,
      item.id,
      item.name,
      indexedText,
      vectorNamespace,
      ctx.contextDAO,
      CONTEXT_SOURCE_TYPE_ONEDRIVE,
      'OneDrive',
    );
  }
}

export { OneDriveIngestionService };
export type { OneDriveIngestionEnv };
