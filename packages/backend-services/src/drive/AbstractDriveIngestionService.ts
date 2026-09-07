import { AiDailyUsageDAO, ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import {
  CONTEXT_AUDIT_EVENT_CONTEXT_INDEXED,
  CONTEXT_AUDIT_LOG_SEVERITY_INFO,
} from '@mail-otter/shared/constants';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AiClient } from '../ai/AiClient';
import { EmailContextUtil } from '../email/EmailContextUtil';
import { DriveDocumentUtil } from './DriveDocumentUtil';

interface DriveIngestionEnv {
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

interface DriveIngestionCounters {
  indexed: number;
  skipped: number;
  failed: number;
}

// Template Method base for Drive ingestion (Strategy: Google vs OneDrive
// supply only cursor handling + raw-text extraction).
// Consolidates ~160 LOC previously duplicated across both services:
// namespace/DAO setup, removed-document loop, ingest error handling,
// fingerprinting, upsert/dedup, Vectorize upsert, audit logging,
// embedding + usage recording.
abstract class AbstractDriveIngestionService {
  protected constructor(protected readonly env: DriveIngestionEnv) {}

  protected async requireContext(
    application: ConnectedApplication,
  ): Promise<
    | { skipped: true }
    | {
        skipped: false;
        vectorNamespace: string;
        contextDAO: ApplicationContextDAO;
        maxBytes: number;
        maxFiles: number;
      }
  > {
    if (!this.env.EMAIL_CONTEXT_INDEX) return { skipped: true };
    const vectorNamespace = await EmailContextUtil.getUserVectorNamespace(application.userEmail);
    const contextDAO = new ApplicationContextDAO(this.env.DB);
    const maxFiles = ConfigurationManager.drive.getMaxFilesPerSync(this.env);
    const maxBytes = ConfigurationManager.attachment.getMaxSizeBytes(this.env);
    return { skipped: false, vectorNamespace, contextDAO, maxBytes, maxFiles };
  }

  protected async deleteRemovedDocuments(
    contextDAO: ApplicationContextDAO,
    application: ConnectedApplication,
    removedIds: string[],
    sourceType: string,
    logPrefix: string,
  ): Promise<void> {
    for (const fileId of removedIds) {
      try {
        const info = await contextDAO.getDocumentSourceInfo(application.applicationId, fileId, sourceType);
        if (info) {
          await this.env.EMAIL_CONTEXT_INDEX!.deleteByIds([info.vectorId]);
          await contextDAO.markDocumentsDeletedByVectorIds(application.applicationId, info.userEmail, [info.vectorId]);
        }
      } catch (error: unknown) {
        console.warn(`${logPrefix} Failed to delete removed file ${fileId}:`, error);
      }
    }
  }

  protected async ingestTextDocument(
    application: ConnectedApplication,
    sourceDocumentId: string,
    title: string,
    indexedText: string,
    vectorNamespace: string,
    contextDAO: ApplicationContextDAO,
    sourceType: string,
    logPrefix: string,
  ): Promise<'indexed' | 'skipped'> {
    const secret = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const sourceDocumentFingerprint = await AiClient.fingerprint(secret, 'source-document', sourceDocumentId);
    const titleFingerprint = await AiClient.fingerprint(secret, 'title', title);
    const contentFingerprint = await AiClient.fingerprint(secret, 'indexed-text', indexedText);

    const document = await contextDAO.upsertDriveDocument({
      applicationId: application.applicationId,
      userEmail: application.userEmail,
      sourceProviderId: application.providerId,
      sourceType,
      sourceDocumentId,
      vectorNamespace,
      sourceDocumentFingerprint,
      titleFingerprint,
      contentFingerprint,
      indexedTextChars: indexedText.length,
    });

    if (document.contentFingerprint === contentFingerprint && document.indexedAt !== null) {
      return 'skipped';
    }

    const embeddingModel = ConfigurationManager.getAiEmbeddingModel(this.env);
    const embedding = await AiClient.embed(this.env.AI, embeddingModel, indexedText);

    await this.env.EMAIL_CONTEXT_INDEX!.upsert([
      {
        id: document.vectorId,
        namespace: vectorNamespace,
        values: embedding,
        metadata: {
          applicationId: application.applicationId,
          sourceType,
          sourceProviderId: application.providerId,
          sourceDocumentId,
          title: AiClient.truncateMetadata(title),
          indexedText,
          indexedAt: Date.now(),
        },
      },
    ]);

    await contextDAO.markDocumentIndexed(document.contextDocumentId);
    await contextDAO.insertAuditLog({
      contextDocumentId: document.contextDocumentId,
      applicationId: application.applicationId,
      userEmail: application.userEmail,
      sourceDocumentId,
      eventType: CONTEXT_AUDIT_EVENT_CONTEXT_INDEXED,
      eventLabel: `${logPrefix} File Indexed Into Context`,
      eventData: { indexedTextChars: indexedText.length, sourceProviderId: application.providerId, vectorId: document.vectorId },
      severity: CONTEXT_AUDIT_LOG_SEVERITY_INFO,
    });

    await AiClient.recordEmbeddingUsage(this.env.DB, embeddingModel, indexedText, `[${logPrefix}IngestionService]`);

    return 'indexed';
  }

  protected buildIndexedText(filename: string, appName: string, rawText: string): string {
    const maxChars = ConfigurationManager.getMaxContextMemoryChars(this.env);
    return DriveDocumentUtil.buildIndexedText(filename, appName, rawText, maxChars);
  }

  protected async markIngestError(
    contextDAO: ApplicationContextDAO,
    application: ConnectedApplication,
    sourceDocumentId: string,
    sourceType: string,
    error: unknown,
  ): Promise<void> {
    try {
      const info = await contextDAO.getDocumentSourceInfo(application.applicationId, sourceDocumentId, sourceType);
      if (info) {
        await contextDAO.markDocumentError(info.contextDocumentId, error instanceof Error ? error.message : String(error));
      }
    } catch {
      // non-fatal
    }
  }

  protected async embed(model: string, text: string): Promise<number[]> {
    return AiClient.embed(this.env.AI, model, text);
  }

  protected async recordEmbeddingUsage(model: string, text: string, logPrefix: string): Promise<void> {
    await AiClient.recordEmbeddingUsage(this.env.DB, model, text, logPrefix);
  }

  protected get embeddingDao(): AiDailyUsageDAO {
    return new AiDailyUsageDAO(this.env.DB);
  }
}

export { AbstractDriveIngestionService };
export type { DriveIngestionCounters, DriveIngestionEnv };
