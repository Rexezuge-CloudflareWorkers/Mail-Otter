import {
  APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
  APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR,
  SOURCE_TYPE_EMAIL,
} from '@mail-otter/shared/constants';
import { DatabaseError } from '@mail-otter/backend-errors';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDeletionRunInternal,
  ApplicationContextDeletionRunList,
  ApplicationContextDocument,
  ApplicationContextDocumentInternal,
  ApplicationContextDocumentList,
  ApplicationContextDocumentSource,
  ApplicationContextSummary,
} from '@mail-otter/shared/model';
import type { ApplicationContextDeletionStatus, ApplicationContextDocumentStatus, ProviderId } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';

class ApplicationContextDAO {
  protected readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
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
      const result: D1Result = await this.database
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
        .run();
      if (!result.success) {
        throw new DatabaseError(`Failed to update application context document: ${result.error}`);
      }
      const updated: ApplicationContextDocument | undefined = await this.getDocumentById(existing.context_document_id);
      if (!updated) throw new DatabaseError('Failed to load application context document after update.');
      return updated;
    }

    const contextDocumentId: string = UUIDUtil.getRandomUUID();
    const vectorId: string = `cd_${contextDocumentId}`;
    const result: D1Result = await this.database
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
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to create application context document: ${result.error}`);
    }
    const document: ApplicationContextDocument | undefined = await this.getDocumentById(contextDocumentId);
    if (!document) throw new DatabaseError('Failed to load application context document after create.');
    return document;
  }

  public async markDocumentIndexed(contextDocumentId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare(
        `
          UPDATE application_context_documents
          SET status = ?, indexed_at = ?, last_error = NULL, updated_at = ?
          WHERE context_document_id = ?
        `,
      )
      .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, now, now, contextDocumentId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to mark application context document indexed: ${result.error}`);
    }
  }

  public async markDocumentError(contextDocumentId: string, errorMessage: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare(
        `
          UPDATE application_context_documents
          SET status = ?, last_error = ?, updated_at = ?
          WHERE context_document_id = ?
        `,
      )
      .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR, errorMessage.slice(0, 1024), now, contextDocumentId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to mark application context document error: ${result.error}`);
    }
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
      lastErrorAt: documentError?.last_error
        ? documentError.updated_at
        : (deletionError?.error_message ? deletionError.updated_at : null),
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
      nextCursor: rows.length > limit ? ApplicationContextDAO.encodeDocumentCursor(pageRows[pageRows.length - 1].updated_at, pageRows[pageRows.length - 1].created_at) : undefined,
    };
  }

  public async listDeletionRunsForUser(userEmail: string, input: ListDeletionRunsInput = {}): Promise<ApplicationContextDeletionRunList> {
    const limit: number = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];
    if (input.applicationId) {
      conditions.push('application_id = ?');
      bindings.push(input.applicationId);
    }
    const cursor: { createdAt: number } | undefined = ApplicationContextDAO.parseDeletionRunCursor(input.cursor);
    if (cursor) {
      conditions.push('created_at < ?');
      bindings.push(cursor.createdAt);
    }
    const rows: ApplicationContextDeletionRunInternal[] = await this.database
      .prepare(
        `
          SELECT deletion_run_id, application_id, user_email, vector_namespace, requested_vector_count, deleted_vector_count,
                 mutation_ids, status, error_message, created_at, updated_at
          FROM application_context_deletion_runs
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, limit + 1)
      .all<ApplicationContextDeletionRunInternal>()
      .then((result: D1Result<ApplicationContextDeletionRunInternal>): ApplicationContextDeletionRunInternal[] => result.results || []);
    const pageRows: ApplicationContextDeletionRunInternal[] = rows.slice(0, limit);
    return {
      deletionRuns: pageRows.map((row: ApplicationContextDeletionRunInternal): ApplicationContextDeletionRun => this.toDeletionRun(row)),
      nextCursor: rows.length > limit ? ApplicationContextDAO.encodeDeletionRunCursor(pageRows[pageRows.length - 1].created_at) : undefined,
    };
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
    const rows: Array<{ vector_id: string }> = await this.database
      .prepare(
        `
          SELECT vector_id
          FROM application_context_documents
          WHERE application_id = ? AND user_email = ? AND status = ?
        `,
      )
      .bind(applicationId, userEmail, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE)
      .all<{ vector_id: string }>()
      .then((result: D1Result<{ vector_id: string }>): Array<{ vector_id: string }> => result.results || []);
    return rows.map((row: { vector_id: string }): string => row.vector_id);
  }

  public async recordDeletionRun(input: RecordDeletionRunInput): Promise<ApplicationContextDeletionRun> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const deletionRunId: string = UUIDUtil.getRandomUUID();
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT INTO application_context_deletion_runs
            (deletion_run_id, application_id, user_email, vector_namespace, requested_vector_count, deleted_vector_count,
             mutation_ids, status, error_message, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        deletionRunId,
        input.applicationId,
        input.userEmail,
        input.vectorNamespace,
        input.requestedVectorCount,
        input.deletedVectorCount,
        JSON.stringify(input.mutationIds),
        input.status,
        input.errorMessage ? input.errorMessage.slice(0, 1024) : null,
        now,
        now,
      )
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to record context deletion run: ${result.error}`);
    }
    const run: ApplicationContextDeletionRun | undefined = await this.getDeletionRunById(deletionRunId);
    if (!run) throw new DatabaseError('Failed to load context deletion run after create.');
    return run;
  }

  public async deleteStaleDeletedDocuments(deletedBefore: number, limit: number): Promise<number> {
    const result: D1Result = await this.database
      .prepare(
        `
          DELETE FROM application_context_documents
          WHERE status = ? AND deleted_at IS NOT NULL AND deleted_at < ?
          LIMIT ?
        `,
      )
      .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED, deletedBefore, limit)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to delete stale deleted context documents: ${result.error}`);
    }
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

  public async deleteStaleErrorDocuments(errorBefore: number, limit: number): Promise<number> {
    const result: D1Result = await this.database
      .prepare(
        `
          DELETE FROM application_context_documents
          WHERE status = ? AND updated_at < ?
          LIMIT ?
        `,
      )
      .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR, errorBefore, limit)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to delete stale error context documents: ${result.error}`);
    }
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

  public async deleteOldDeletionRuns(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await this.database
      .prepare(
        `
          DELETE FROM application_context_deletion_runs
          WHERE created_at < ?
          LIMIT ?
        `,
      )
      .bind(olderThan, limit)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to delete old context deletion runs: ${result.error}`);
    }
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

  public async listApplicationsOverDocumentLimit(globalMax: number): Promise<OverLimitApplication[]> {
    const rows = await this.database
      .prepare(
        `
          SELECT
            ca.application_id,
            ca.user_email,
            COUNT(acd.context_document_id) AS active_count,
            COALESCE(ca.max_context_documents, ?) AS effective_limit
          FROM connected_applications ca
          JOIN application_context_documents acd
            ON acd.application_id = ca.application_id
            AND acd.status = ?
          GROUP BY ca.application_id, ca.user_email, ca.max_context_documents
          HAVING COUNT(acd.context_document_id) > COALESCE(ca.max_context_documents, ?)
        `,
      )
      .bind(globalMax, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, globalMax)
      .all<{ application_id: string; user_email: string; active_count: number; effective_limit: number }>()
      .then((r) => r.results || []);
    return rows.map((r) => ({
      applicationId: r.application_id,
      userEmail: r.user_email,
      activeCount: r.active_count,
      effectiveLimit: r.effective_limit,
    }));
  }

  public async listOldestActiveVectorIdsForApplication(applicationId: string, userEmail: string, count: number): Promise<string[]> {
    const rows = await this.database
      .prepare(
        `
          SELECT vector_id
          FROM application_context_documents
          WHERE application_id = ? AND user_email = ? AND status = ?
          ORDER BY created_at ASC
          LIMIT ?
        `,
      )
      .bind(applicationId, userEmail, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, count)
      .all<{ vector_id: string }>()
      .then((r) => r.results || []);
    return rows.map((r) => r.vector_id);
  }

  public async markDocumentsDeletedByVectorIds(applicationId: string, userEmail: string, vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) return;
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    for (const chunk of ApplicationContextDAO.chunk(vectorIds, 100)) {
      const placeholders: string = chunk.map((): string => '?').join(', ');
      const result: D1Result = await this.database
        .prepare(
          `
            UPDATE application_context_documents
            SET status = ?, deleted_at = ?, updated_at = ?
            WHERE application_id = ? AND user_email = ? AND vector_id IN (${placeholders})
          `,
        )
        .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED, now, now, applicationId, userEmail, ...chunk)
        .run();
      if (!result.success) {
        throw new DatabaseError(`Failed to mark context documents deleted: ${result.error}`);
      }
    }
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

  private async getDeletionRunById(deletionRunId: string): Promise<ApplicationContextDeletionRun | undefined> {
    const row: ApplicationContextDeletionRunInternal | null = await this.database
      .prepare(
        `
          SELECT deletion_run_id, application_id, user_email, vector_namespace, requested_vector_count, deleted_vector_count,
                 mutation_ids, status, error_message, created_at, updated_at
          FROM application_context_deletion_runs
          WHERE deletion_run_id = ?
          LIMIT 1
        `,
      )
      .bind(deletionRunId)
      .first<ApplicationContextDeletionRunInternal>();
    return row ? this.toDeletionRun(row) : undefined;
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

  private toDeletionRun(row: ApplicationContextDeletionRunInternal): ApplicationContextDeletionRun {
    return {
      deletionRunId: row.deletion_run_id,
      applicationId: row.application_id,
      userEmail: row.user_email,
      vectorNamespace: row.vector_namespace,
      requestedVectorCount: row.requested_vector_count,
      deletedVectorCount: row.deleted_vector_count,
      mutationIds: ApplicationContextDAO.parseMutationIds(row.mutation_ids),
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static parseDocumentCursor(cursor: string | undefined): { updatedAt: number; createdAt: number } | undefined {
    if (!cursor) return undefined;
    try {
      const decoded: string = atob(cursor);
      const parsed: unknown = JSON.parse(decoded);
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'number' && typeof parsed[1] === 'number') {
        return { updatedAt: parsed[0], createdAt: parsed[1] };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private static encodeDocumentCursor(updatedAt: number, createdAt: number): string {
    return btoa(JSON.stringify([updatedAt, createdAt]));
  }

  private static parseDeletionRunCursor(cursor: string | undefined): { createdAt: number } | undefined {
    if (!cursor) return undefined;
    try {
      const decoded: string = atob(cursor);
      const parsed: unknown = JSON.parse(decoded);
      if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'number') {
        return { createdAt: parsed[0] };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private static encodeDeletionRunCursor(createdAt: number): string {
    return btoa(JSON.stringify([createdAt]));
  }

  private static parseMutationIds(value: string | null): string[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item: unknown): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private static chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
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
  sourceThreadId?: string | null | undefined;
  vectorNamespace: string;
  sourceDocumentFingerprint: string;
  sourceThreadFingerprint?: string | null | undefined;
  titleFingerprint?: string | null | undefined;
  senderFingerprint?: string | null | undefined;
  contentFingerprint: string;
  indexedTextChars: number;
}

interface ListContextDocumentsInput {
  applicationId?: string | undefined;
  status?: ApplicationContextDocumentStatus | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

interface ListDeletionRunsInput {
  applicationId?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

interface RecordDeletionRunInput {
  applicationId: string;
  userEmail: string;
  vectorNamespace: string;
  requestedVectorCount: number;
  deletedVectorCount: number;
  mutationIds: string[];
  status: ApplicationContextDeletionStatus;
  errorMessage?: string | null | undefined;
}

interface OverLimitApplication {
  applicationId: string;
  userEmail: string;
  activeCount: number;
  effectiveLimit: number;
}

export { ApplicationContextDAO };
export type { ListContextDocumentsInput, ListDeletionRunsInput, OverLimitApplication, RecordDeletionRunInput, UpsertEmailDocumentInput };
