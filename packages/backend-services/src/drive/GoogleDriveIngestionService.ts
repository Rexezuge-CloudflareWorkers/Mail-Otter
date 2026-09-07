import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { GoogleDriveProviderUtil } from '@mail-otter/provider-clients/google-drive';
import type { DriveFile } from '@mail-otter/provider-clients/google-drive';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import {
  CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE,
} from '@mail-otter/shared/constants';
import { AbstractDriveIngestionService } from './AbstractDriveIngestionService';
import type { DriveIngestionEnv } from './AbstractDriveIngestionService';
import { DriveDocumentUtil } from './DriveDocumentUtil';

interface DriveIngestionResult {
  indexed: number;
  skipped: number;
  failed: number;
  newCursor: string | null;
}

interface GoogleDriveIngestionEnv extends DriveIngestionEnv {
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

class GoogleDriveIngestionService extends AbstractDriveIngestionService {
  constructor(env: GoogleDriveIngestionEnv) {
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

    const currentPageToken = await applicationDAO.getProviderConfig(
      application.applicationId,
      'google_drive_page_token',
    );

    if (!currentPageToken) {
      const freshToken = await GoogleDriveProviderUtil.getStartPageToken(accessToken);
      await applicationDAO.setProviderConfig(
        application.applicationId,
        'google_drive_page_token',
        freshToken,
      );
      return { indexed: 0, skipped: 0, failed: 0, newCursor: null };
    }

    const changes = await GoogleDriveProviderUtil.listChanges(accessToken, currentPageToken, maxFiles);

    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    await this.deleteRemovedDocuments(
      contextDAO,
      application,
      changes.removed,
      CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE,
      '[GoogleDriveIngestionService]',
    );

    for (const file of changes.files) {
      try {
        const result = await this.ingestFile(
          application,
          accessToken,
          file,
          vectorNamespace,
          maxBytes,
        );
        if (result === 'indexed') indexed++;
        else if (result === 'skipped') skipped++;
      } catch (error: unknown) {
        failed++;
        console.warn(`[GoogleDriveIngestionService] Failed to ingest file ${file.id}:`, error);
        await this.markIngestError(contextDAO, application, file.id, CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE, error);
      }
    }

    const newCursor = changes.newStartPageToken ?? changes.nextPageToken;
    if (newCursor) {
      await applicationDAO.setProviderConfig(
        application.applicationId,
        'google_drive_page_token',
        newCursor,
      );
    }

    return { indexed, skipped, failed, newCursor };
  }

  private async ingestFile(
    application: ConnectedApplication,
    accessToken: string,
    file: DriveFile,
    vectorNamespace: string,
    maxBytes: number,
  ): Promise<'indexed' | 'skipped'> {
    if (file.size !== undefined && Number(file.size) > maxBytes) {
      return 'skipped';
    }

    let rawText: string | null = null;
    if (GoogleDriveProviderUtil.isExportableMimeType(file.mimeType)) {
      rawText = await GoogleDriveProviderUtil.exportDocument(accessToken, file.id);
    } else {
      const buffer = await GoogleDriveProviderUtil.downloadFile(accessToken, file.id, maxBytes);
      rawText = DriveDocumentUtil.extractText(buffer, file.mimeType);
    }

    if (!rawText || rawText.trim().length === 0) {
      return 'skipped';
    }

    const indexedText = this.buildIndexedText(file.name, application.displayName, rawText);
    const ctx = await this.requireContext(application);
    if (ctx.skipped) return 'skipped';
    return this.ingestTextDocument(
      application,
      file.id,
      file.name,
      indexedText,
      vectorNamespace,
      ctx.contextDAO,
      CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE,
      'Drive',
    );
  }
}

export { GoogleDriveIngestionService };
export type { DriveIngestionResult, GoogleDriveIngestionEnv };
