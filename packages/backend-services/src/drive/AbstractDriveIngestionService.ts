import { AiDailyUsageDAO, ApplicationContextDAO, ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { CONTEXT_AUDIT_EVENT_CONTEXT_INDEXED, CONTEXT_AUDIT_LOG_SEVERITY_INFO } from '@mail-otter/shared/constants';
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

interface DriveIngestionResult {
  indexed: number;
  skipped: number;
  failed: number;
  newCursor: string | null;
}

interface DriveChangeSet<TItem> {
  removedIds: string[];
  items: TItem[];
  newCursor: string | null;
}

interface DriveBootstrap {
  bootstrapped: true;
  bootstrapCursor: string;
}

interface DriveFetchDeps {
  applicationDAO: ConnectedApplicationDAO;
  application: ConnectedApplication;
}

interface DriveExtractedDocument {
  sourceDocumentId: string;
  title: string;
  rawText: string | null;
}

// Template Method base for Drive ingestion (Strategy: Google vs OneDrive
// supply only cursor handling + raw-text extraction).
// Consolidates cursor/loop/counters/setProviderConfig previously duplicated
// across both services: namespace/DAO setup, removed-document loop, ingest
// error handling, fingerprinting, upsert/dedup, Vectorize upsert, audit
// logging, embedding + usage recording.
abstract class AbstractDriveIngestionService<TItem extends { id: string } = { id: string }> {
  protected constructor(protected readonly env: DriveIngestionEnv) {}

  protected abstract readonly driveCursorKey: string;
  protected abstract readonly driveSourceType: string;
  protected abstract readonly driveLogPrefix: string;

  protected abstract fetchChanges(
    accessToken: string,
    storedCursor: string | null,
    maxFiles: number,
    deps: DriveFetchDeps,
  ): Promise<DriveChangeSet<TItem> | DriveBootstrap>;

  protected abstract extractText(accessToken: string, item: TItem, maxBytes: number): Promise<DriveExtractedDocument | null>;

  protected async ingestForApplicationTemplate(application: ConnectedApplication, accessToken: string): Promise<DriveIngestionResult> {
    const ctx = await this.requireContext(application);
    if (ctx.skipped) {
      return { indexed: 0, skipped: 0, failed: 0, newCursor: null };
    }
    const { vectorNamespace, contextDAO, maxBytes, maxFiles } = ctx;
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);

    const storedCursor = await applicationDAO.getProviderConfig(application.applicationId, this.driveCursorKey);
    const changes = await this.fetchChanges(accessToken, storedCursor, maxFiles, { applicationDAO, application });

    if (isDriveBootstrap(changes)) {
      await applicationDAO.setProviderConfig(application.applicationId, this.driveCursorKey, changes.bootstrapCursor);
      return { indexed: 0, skipped: 0, failed: 0, newCursor: null };
    }

    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    await this.deleteRemovedDocuments(contextDAO, application, changes.removedIds, this.driveSourceType, this.driveLogPrefix);

    for (const item of changes.items) {
      try {
        const extracted = await this.extractText(accessToken, item, maxBytes);
        if (!extracted || !extracted.rawText || extracted.rawText.trim().length === 0) {
          skipped++;
          continue;
        }
        const indexedText = this.buildIndexedText(extracted.title, application.displayName, extracted.rawText);
        const outcome = await this.ingestTextDocument(
          application,
          extracted.sourceDocumentId,
          extracted.title,
          indexedText,
          vectorNamespace,
          contextDAO,
          this.driveSourceType,
          this.driveLogPrefix,
        );
        if (outcome === 'indexed') indexed++;
        else skipped++;
      } catch (error: unknown) {
        failed++;
        console.warn(`${this.driveLogPrefix} Failed to ingest file ${item.id}:`, error);
        await this.markIngestError(contextDAO, application, item.id, this.driveSourceType, error);
      }
    }

    const newCursor = changes.newCursor;
    if (newCursor) {
      await applicationDAO.setProviderConfig(application.applicationId, this.driveCursorKey, newCursor);
    }

    return { indexed, skipped, failed, newCursor };
  }

  protected async requireContext(application: ConnectedApplication): Promise<
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

function isDriveBootstrap(value: unknown): value is DriveBootstrap {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { bootstrapped?: unknown }).bootstrapped === true &&
    typeof (value as { bootstrapCursor?: unknown }).bootstrapCursor === 'string'
  );
}

export { AbstractDriveIngestionService, isDriveBootstrap };
export type {
  DriveBootstrap,
  DriveChangeSet,
  DriveExtractedDocument,
  DriveFetchDeps,
  DriveIngestionCounters,
  DriveIngestionEnv,
  DriveIngestionResult,
};
