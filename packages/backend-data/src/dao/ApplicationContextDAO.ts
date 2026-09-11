import {
  APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
  APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR,
  SOURCE_TYPE_EMAIL,
} from '@mail-otter/shared/constants';
import { DatabaseError } from '@mail-otter/backend-errors';
import { CursorUtil, executeD1WithRetry } from '../utils';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDeletionRunList,
  ApplicationContextDocument,
  ApplicationContextDocumentInternal,
  ApplicationContextDocumentList,
  ApplicationContextDocumentSource,
  ApplicationContextSummary,
  ContextAuditLogList,
} from '@mail-otter/shared/model';
import type {
  ApplicationContextDeletionStatus,
  ApplicationContextDocumentStatus,
  ProviderId,
  ContextAuditEventType,
  ContextAuditLogSeverity,
} from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';
import { ContextAuditLogDAO } from './ContextAuditLogDAO';
import { ContextDeletionRunDAO } from './ContextDeletionRunDAO';
import { ApplicationContextDocumentQueries } from './ApplicationContextDocumentQueries';
import type { ApplicationContextUserCounts, OverLimitApplication } from './ApplicationContextDocumentQueries';

class ApplicationContextDAO extends BaseDAO {
  private auditLogsDAO(): ContextAuditLogDAO {
    return new ContextAuditLogDAO(this.database);
  }

  private deletionRunsDAO(): ContextDeletionRunDAO {
    return new ContextDeletionRunDAO(this.database);
  }

  private documentQueries(): ApplicationContextDocumentQueries {
    return new ApplicationContextDocumentQueries(this.database);
  }

  public async upsertEmailDocument(input: UpsertEmailDocumentInput): Promise<ApplicationContextDocument> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const existing: ApplicationContextDocumentInternal | null = await this.database
      .prepare(
        `
          SELECT ${ApplicationContextDAO.documentColumns}
          FROM application_context_documents
          WHERE application_id = ? AND source_type = ? AND source_document_id = ?
          LIMIT 1
        `,
      )
      .bind(input.applicationId, SOURCE_TYPE_EMAIL, input.sourceDocumentId)
      .first<ApplicationContextDocumentInternal>();

    if (existing) {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare(
              `
                UPDATE application_context_documents
                SET user_email = ?, source_provider_id = ?, source_thread_id = ?, vector_namespace = ?,
                    source_document_fingerprint = ?, source_thread_fingerprint = ?, title_fingerprint = ?, sender_fingerprint = ?,
                    content_fingerprint = ?, indexed_text_chars = ?, status = ?, deleted_at = NULL, last_error = NULL, updated_at = ?
                WHERE context_document_id = ?
              `,
            )
            .bind(
              input.userEmail,
              input.sourceProviderId,
              input.sourceThreadId || null,
              input.vectorNamespace,
              input.sourceDocumentFingerprint,
              input.sourceThreadFingerprint || null,
              input.titleFingerprint || null,
              input.senderFingerprint || null,
              input.contentFingerprint,
              input.indexedTextChars,
              APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
              now,
              existing.context_document_id,
            )
            .run(),
        'update application context document',
      );
      const updated: ApplicationContextDocument | undefined = await this.getDocumentById(existing.context_document_id);
      if (!updated) throw new DatabaseError('Failed to load application context document after update.');
      return updated;
    }

    const contextDocumentId: string = UUIDUtil.getRandomUUID();
    const vectorId: string = `cd_${contextDocumentId}`;
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO application_context_documents
                (context_document_id, application_id, user_email, source_type, source_provider_id, source_document_id, source_thread_id,
                 vector_namespace, vector_id, source_document_fingerprint, source_thread_fingerprint, title_fingerprint, sender_fingerprint,
                 content_fingerprint, indexed_text_chars, status, indexed_at, deleted_at, last_error, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
            `,
          )
          .bind(
            contextDocumentId,
            input.applicationId,
            input.userEmail,
            SOURCE_TYPE_EMAIL,
            input.sourceProviderId,
            input.sourceDocumentId,
            input.sourceThreadId || null,
            input.vectorNamespace,
            vectorId,
            input.sourceDocumentFingerprint,
            input.sourceThreadFingerprint || null,
            input.titleFingerprint || null,
            input.senderFingerprint || null,
            input.contentFingerprint,
            input.indexedTextChars,
            APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
            now,
            now,
          )
          .run(),
      'create application context document',
    );
    const document: ApplicationContextDocument | undefined = await this.getDocumentById(contextDocumentId);
    if (!document) throw new DatabaseError('Failed to load application context document after create.');
    return document;
  }

  public async upsertDriveDocument(input: UpsertDriveDocumentInput): Promise<ApplicationContextDocument> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const existing: ApplicationContextDocumentInternal | null = await this.database
      .prepare(
        `
          SELECT ${ApplicationContextDAO.documentColumns}
          FROM application_context_documents
          WHERE application_id = ? AND source_type = ? AND source_document_id = ?
          LIMIT 1
        `,
      )
      .bind(input.applicationId, input.sourceType, input.sourceDocumentId)
      .first<ApplicationContextDocumentInternal>();

    if (existing) {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare(
              `
                UPDATE application_context_documents
                SET user_email = ?, source_provider_id = ?, vector_namespace = ?,
                    source_document_fingerprint = ?, title_fingerprint = ?,
                    content_fingerprint = ?, indexed_text_chars = ?, status = ?,
                    source_thread_id = NULL, source_thread_fingerprint = NULL, sender_fingerprint = NULL,
                    deleted_at = NULL, last_error = NULL, updated_at = ?
                WHERE context_document_id = ?
              `,
            )
            .bind(
              input.userEmail,
              input.sourceProviderId,
              input.vectorNamespace,
              input.sourceDocumentFingerprint,
              input.titleFingerprint,
              input.contentFingerprint,
              input.indexedTextChars,
              APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
              now,
              existing.context_document_id,
            )
            .run(),
        'update drive context document',
      );
      const updated: ApplicationContextDocument | undefined = await this.getDocumentById(existing.context_document_id);
      if (!updated) throw new DatabaseError('Failed to load application context document after update.');
      return updated;
    }

    const contextDocumentId: string = UUIDUtil.getRandomUUID();
    const vectorId: string = `cd_${contextDocumentId}`;
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO application_context_documents
                (context_document_id, application_id, user_email, source_type, source_provider_id, source_document_id, source_thread_id,
                 vector_namespace, vector_id, source_document_fingerprint, source_thread_fingerprint, title_fingerprint, sender_fingerprint,
                 content_fingerprint, indexed_text_chars, status, indexed_at, deleted_at, last_error, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?)
            `,
          )
          .bind(
            contextDocumentId,
            input.applicationId,
            input.userEmail,
            input.sourceType,
            input.sourceProviderId,
            input.sourceDocumentId,
            input.vectorNamespace,
            vectorId,
            input.sourceDocumentFingerprint,
            input.titleFingerprint,
            input.contentFingerprint,
            input.indexedTextChars,
            APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
            now,
            now,
          )
          .run(),
      'create drive context document',
    );
    const document: ApplicationContextDocument | undefined = await this.getDocumentById(contextDocumentId);
    if (!document) throw new DatabaseError('Failed to load application context document after create.');
    return document;
  }

  public async getDocumentSourceInfo(
    applicationId: string,
    sourceDocumentId: string,
    sourceType: string,
  ): Promise<{ contextDocumentId: string; vectorId: string; userEmail: string } | undefined> {
    const row: { context_document_id: string; vector_id: string; user_email: string } | null = await this.database
      .prepare(
        `
            SELECT context_document_id, vector_id, user_email
            FROM application_context_documents
            WHERE application_id = ? AND source_type = ? AND source_document_id = ?
            LIMIT 1
          `,
      )
      .bind(applicationId, sourceType, sourceDocumentId)
      .first<{ context_document_id: string; vector_id: string; user_email: string }>();
    if (!row) return undefined;
    return {
      contextDocumentId: row.context_document_id,
      vectorId: row.vector_id,
      userEmail: row.user_email,
    };
  }

  public async getContextDocumentIdBySource(
    applicationId: string,
    sourceDocumentId: string,
    sourceType: string,
  ): Promise<string | undefined> {
    const row: { context_document_id: string } | null = await this.database
      .prepare(
        `
          SELECT context_document_id
          FROM application_context_documents
          WHERE application_id = ? AND source_type = ? AND source_document_id = ?
          LIMIT 1
        `,
      )
      .bind(applicationId, sourceType, sourceDocumentId)
      .first<{ context_document_id: string }>();
    return row?.context_document_id;
  }

  public async markDocumentIndexed(contextDocumentId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE application_context_documents
              SET status = ?, indexed_at = ?, last_error = NULL, updated_at = ?
              WHERE context_document_id = ?
            `,
          )
          .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, now, now, contextDocumentId)
          .run(),
      'mark application context document indexed',
    );
  }

  public async markDocumentError(contextDocumentId: string, errorMessage: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE application_context_documents
              SET status = ?, last_error = ?, updated_at = ?
              WHERE context_document_id = ?
            `,
          )
          .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR, errorMessage.slice(0, 1024), now, contextDocumentId)
          .run(),
      'mark application context document error',
    );
  }

  public async getSummaryByApplication(applicationId: string): Promise<ApplicationContextSummary> {
    const countRow: { count: number; last_indexed_at: number | null } | null = await this.database
      .prepare(
        `
          SELECT COUNT(*) AS count, MAX(indexed_at) AS last_indexed_at
          FROM application_context_documents
          WHERE application_id = ? AND status = ?
        `,
      )
      .bind(applicationId, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE)
      .first<{ count: number; last_indexed_at: number | null }>();
    const deletionRow: { last_delete_accepted_at: number | null } | null = await this.database
      .prepare(
        `
          SELECT MAX(created_at) AS last_delete_accepted_at
          FROM application_context_deletion_runs
          WHERE application_id = ? AND status = ?
        `,
      )
      .bind(applicationId, APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED)
      .first<{ last_delete_accepted_at: number | null }>();
    const documentError: { last_error: string | null; updated_at: number } | null = await this.database
      .prepare(
        `
          SELECT last_error, updated_at
          FROM application_context_documents
          WHERE application_id = ? AND last_error IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId)
      .first<{ last_error: string | null; updated_at: number }>();
    const deletionError: { error_message: string | null; updated_at: number } | null = await this.database
      .prepare(
        `
          SELECT error_message, updated_at
          FROM application_context_deletion_runs
          WHERE application_id = ? AND status = ? AND error_message IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId, APPLICATION_CONTEXT_DELETION_STATUS_ERROR)
      .first<{ error_message: string | null; updated_at: number }>();
    return {
      applicationId,
      documentCount: countRow?.count ?? 0,
      lastIndexedAt: countRow?.last_indexed_at ?? null,
      lastDeleteAcceptedAt: deletionRow?.last_delete_accepted_at ?? null,
      lastError: documentError?.last_error || deletionError?.error_message || null,
      lastErrorAt: documentError?.last_error ? documentError.updated_at : deletionError?.error_message ? deletionError.updated_at : null,
    };
  }

  public async listDocumentsForUser(userEmail: string, input: ListContextDocumentsInput = {}): Promise<ApplicationContextDocumentList> {
    const limit: number = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];
    if (input.applicationId) {
      conditions.push('application_id = ?');
      bindings.push(input.applicationId);
    }
    if (input.status) {
      conditions.push('status = ?');
      bindings.push(input.status);
    }
    const cursor: { updatedAt: number; createdAt: number } | undefined = ApplicationContextDAO.parseDocumentCursor(input.cursor);
    if (cursor) {
      conditions.push('(updated_at < ? OR (updated_at = ? AND created_at < ?))');
      bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.createdAt);
    }
    const rows: ApplicationContextDocumentInternal[] = await this.database
      .prepare(
        `
          SELECT ${ApplicationContextDAO.documentColumns}
          FROM application_context_documents
          WHERE ${conditions.join(' AND ')}
          ORDER BY updated_at DESC, created_at DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, limit + 1)
      .all<ApplicationContextDocumentInternal>()
      .then((result: D1Result<ApplicationContextDocumentInternal>): ApplicationContextDocumentInternal[] => result.results || []);
    const pageRows: ApplicationContextDocumentInternal[] = rows.slice(0, limit);
    return {
      documents: pageRows.map((row: ApplicationContextDocumentInternal): ApplicationContextDocument => this.toDocument(row)),
      nextCursor:
        rows.length > limit
          ? ApplicationContextDAO.encodeDocumentCursor(pageRows.at(-1)!.updated_at, pageRows.at(-1)!.created_at)
          : undefined,
    };
  }

  public async listDeletionRunsForUser(userEmail: string, input: ListDeletionRunsInput = {}): Promise<ApplicationContextDeletionRunList> {
    return this.deletionRunsDAO().listDeletionRunsForUser(userEmail, input);
  }

  public async getDocumentSourceForUser(
    contextDocumentId: string,
    userEmail: string,
  ): Promise<ApplicationContextDocumentSource | undefined> {
    const row: Pick<
      ApplicationContextDocumentInternal,
      'context_document_id' | 'application_id' | 'user_email' | 'source_provider_id' | 'source_document_id' | 'source_thread_id' | 'status'
    > | null = await this.database
      .prepare(
        `
          SELECT context_document_id, application_id, user_email, source_provider_id, source_document_id, source_thread_id, status
          FROM application_context_documents
          WHERE context_document_id = ? AND user_email = ?
          LIMIT 1
        `,
      )
      .bind(contextDocumentId, userEmail)
      .first<
        Pick<
          ApplicationContextDocumentInternal,
          | 'context_document_id'
          | 'application_id'
          | 'user_email'
          | 'source_provider_id'
          | 'source_document_id'
          | 'source_thread_id'
          | 'status'
        >
      >();
    if (!row) return undefined;
    return {
      contextDocumentId: row.context_document_id,
      applicationId: row.application_id,
      userEmail: row.user_email,
      sourceProviderId: row.source_provider_id,
      sourceDocumentId: row.source_document_id,
      sourceThreadId: row.source_thread_id,
      status: row.status,
    };
  }

  public async listActiveVectorIdsForApplication(applicationId: string, userEmail: string): Promise<string[]> {
    return this.documentQueries().listActiveVectorIdsForApplication(applicationId, userEmail);
  }

  public async recordDeletionRun(input: RecordDeletionRunInput): Promise<ApplicationContextDeletionRun> {
    return this.deletionRunsDAO().recordDeletionRun(input);
  }

  public async deleteStaleDeletedDocuments(deletedBefore: number, limit: number): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM application_context_documents
              WHERE context_document_id IN (
                SELECT context_document_id FROM application_context_documents
                WHERE status = ? AND deleted_at IS NOT NULL AND deleted_at < ?
                LIMIT ?
              )
            `,
          )
          .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED, deletedBefore, limit)
          .run(),
      'delete stale deleted context documents',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  public async deleteStaleErrorDocuments(errorBefore: number, limit: number): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM application_context_documents
              WHERE context_document_id IN (
                SELECT context_document_id FROM application_context_documents
                WHERE status = ? AND updated_at < ?
                LIMIT ?
              )
            `,
          )
          .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR, errorBefore, limit)
          .run(),
      'delete stale error context documents',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  public async insertAuditLog(input: InsertAuditLogInput): Promise<void> {
    await this.auditLogsDAO().insertAuditLog(input);
  }

  public async insertAuditLogs(inputs: InsertAuditLogInput[]): Promise<void> {
    await this.auditLogsDAO().insertAuditLogs(inputs);
  }

  public async listAuditLogs(contextDocumentId: string, options: ListAuditLogsOptions = {}): Promise<ContextAuditLogList> {
    return this.auditLogsDAO().listAuditLogs(contextDocumentId, options);
  }

  public async deleteOldAuditLogs(olderThan: number, limit: number): Promise<number> {
    return this.auditLogsDAO().deleteOldAuditLogs(olderThan, limit);
  }

  public async deleteOldDeletionRuns(olderThan: number, limit: number): Promise<number> {
    return this.deletionRunsDAO().deleteOldDeletionRuns(olderThan, limit);
  }

  public async listApplicationsOverDocumentLimit(globalMax: number): Promise<OverLimitApplication[]> {
    return this.documentQueries().listApplicationsOverDocumentLimit(globalMax);
  }

  public async listOldestActiveVectorIdsForApplication(applicationId: string, userEmail: string, count: number): Promise<string[]> {
    return this.documentQueries().listOldestActiveVectorIdsForApplication(applicationId, userEmail, count);
  }

  public async getDocumentSourcesByVectorIds(
    applicationId: string,
    userEmail: string,
    vectorIds: string[],
  ): Promise<Array<{ contextDocumentId: string; sourceDocumentId: string | null }>> {
    return this.documentQueries().getDocumentSourcesByVectorIds(applicationId, userEmail, vectorIds);
  }

  public async markDocumentsDeletedByVectorIds(applicationId: string, userEmail: string, vectorIds: string[]): Promise<void> {
    await this.documentQueries().markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
  }

  public async getCountsByUserEmail(userEmail: string, applicationId?: string): Promise<ApplicationContextUserCounts> {
    return this.documentQueries().getCountsByUserEmail(userEmail, applicationId);
  }

  private async getDocumentById(contextDocumentId: string): Promise<ApplicationContextDocument | undefined> {
    const row: ApplicationContextDocumentInternal | null = await this.database
      .prepare(
        `
          SELECT ${ApplicationContextDAO.documentColumns}
          FROM application_context_documents
          WHERE context_document_id = ?
          LIMIT 1
        `,
      )
      .bind(contextDocumentId)
      .first<ApplicationContextDocumentInternal>();
    return row ? this.toDocument(row) : undefined;
  }

  private toDocument(row: ApplicationContextDocumentInternal): ApplicationContextDocument {
    return {
      contextDocumentId: row.context_document_id,
      applicationId: row.application_id,
      userEmail: row.user_email,
      sourceType: row.source_type,
      sourceProviderId: row.source_provider_id,
      vectorNamespace: row.vector_namespace,
      vectorId: row.vector_id,
      sourceDocumentFingerprint: row.source_document_fingerprint,
      sourceThreadFingerprint: row.source_thread_fingerprint,
      titleFingerprint: row.title_fingerprint,
      senderFingerprint: row.sender_fingerprint,
      contentFingerprint: row.content_fingerprint,
      indexedTextChars: row.indexed_text_chars,
      status: row.status,
      indexedAt: row.indexed_at,
      deletedAt: row.deleted_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static parseDocumentCursor(cursor: string | undefined): { updatedAt: number; createdAt: number } | undefined {
    const parsed = CursorUtil.decode<unknown[]>(cursor);
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'number' && typeof parsed[1] === 'number') {
      return { updatedAt: parsed[0], createdAt: parsed[1] };
    }
    return undefined;
  }

  private static encodeDocumentCursor(updatedAt: number, createdAt: number): string {
    return CursorUtil.encode([updatedAt, createdAt]);
  }

  private static readonly documentColumns: string = [
    'context_document_id',
    'application_id',
    'user_email',
    'source_type',
    'source_provider_id',
    'source_document_id',
    'source_thread_id',
    'vector_namespace',
    'vector_id',
    'source_document_fingerprint',
    'source_thread_fingerprint',
    'title_fingerprint',
    'sender_fingerprint',
    'content_fingerprint',
    'indexed_text_chars',
    'status',
    'indexed_at',
    'deleted_at',
    'last_error',
    'created_at',
    'updated_at',
  ].join(', ');
}

interface UpsertEmailDocumentInput {
  applicationId: string;
  userEmail: string;
  sourceProviderId: ProviderId;
  sourceDocumentId: string;
  sourceThreadId?: string | null;
  vectorNamespace: string;
  sourceDocumentFingerprint: string;
  sourceThreadFingerprint?: string | null;
  titleFingerprint?: string | null;
  senderFingerprint?: string | null;
  contentFingerprint: string;
  indexedTextChars: number;
}

interface UpsertDriveDocumentInput {
  applicationId: string;
  userEmail: string;
  sourceProviderId: ProviderId;
  sourceType: string;
  sourceDocumentId: string;
  vectorNamespace: string;
  sourceDocumentFingerprint: string;
  titleFingerprint: string;
  contentFingerprint: string;
  indexedTextChars: number;
}

interface ListContextDocumentsInput {
  applicationId?: string;
  status?: ApplicationContextDocumentStatus;
  cursor?: string;
  limit?: number;
}

interface ListDeletionRunsInput {
  applicationId?: string;
  cursor?: string;
  limit?: number;
}

interface RecordDeletionRunInput {
  applicationId: string;
  userEmail: string;
  vectorNamespace: string;
  requestedVectorCount: number;
  deletedVectorCount: number;
  mutationIds: string[];
  status: ApplicationContextDeletionStatus;
  errorMessage?: string | null;
}

interface InsertAuditLogInput {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceDocumentId?: string | null;
  eventType: ContextAuditEventType;
  eventLabel?: string | null;
  eventData?: unknown;
  severity: ContextAuditLogSeverity;
}

interface ListAuditLogsOptions {
  cursor?: string;
  limit?: number;
}

export { ApplicationContextDAO };
export type {
  InsertAuditLogInput,
  ListAuditLogsOptions,
  ListContextDocumentsInput,
  ListDeletionRunsInput,
  RecordDeletionRunInput,
  UpsertDriveDocumentInput,
  UpsertEmailDocumentInput,
};
export type { ApplicationContextUserCounts, OverLimitApplication } from './ApplicationContextDocumentQueries';
