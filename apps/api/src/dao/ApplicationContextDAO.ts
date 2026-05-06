import {
  APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
  APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR,
} from '@mail-otter/shared/constants';
import { DatabaseError } from '@/error';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDeletionRunInternal,
  ApplicationContextDeletionRunList,
  ApplicationContextDocument,
  ApplicationContextDocumentInternal,
  ApplicationContextDocumentList,
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
      .bind(input.applicationId, 'email', input.sourceDocumentId)
      .first<ApplicationContextDocumentInternal>();

    if (existing) {
      const result: D1Result = await this.database
        .prepare(
          `
            UPDATE application_context_documents
            SET user_email = ?, source_provider_id = ?, source_thread_id = ?, vector_namespace = ?, title = ?, sender = ?,
                indexed_text = ?, status = ?, deleted_at = NULL, last_error = NULL, updated_at = ?
            WHERE context_document_id = ?
          `,
        )
        .bind(
          input.userEmail,
          input.sourceProviderId,
          input.sourceThreadId || null,
          input.vectorNamespace,
          input.title || null,
          input.sender || null,
          input.indexedText,
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
             vector_namespace, vector_id, title, sender, indexed_text, status, indexed_at, deleted_at, last_error, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        `,
      )
      .bind(
        contextDocumentId,
        input.applicationId,
        input.userEmail,
        'email',
        input.sourceProviderId,
        input.sourceDocumentId,
        input.sourceThreadId || null,
        input.vectorNamespace,
        vectorId,
        input.title || null,
        input.sender || null,
        input.indexedText,
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
    const documentError: { last_error: string | null } | null = await this.database
      .prepare(
        `
          SELECT last_error
          FROM application_context_documents
          WHERE application_id = ? AND last_error IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId)
      .first<{ last_error: string | null }>();
    const deletionError: { error_message: string | null } | null = await this.database
      .prepare(
        `
          SELECT error_message
          FROM application_context_deletion_runs
          WHERE application_id = ? AND status = ? AND error_message IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId, APPLICATION_CONTEXT_DELETION_STATUS_ERROR)
      .first<{ error_message: string | null }>();
    return {
      applicationId,
      documentCount: countRow?.count ?? 0,
      lastIndexedAt: countRow?.last_indexed_at ?? null,
      lastDeleteAcceptedAt: deletionRow?.last_delete_accepted_at ?? null,
      lastError: documentError?.last_error || deletionError?.error_message || null,
    };
  }

  public async listDocumentsForUser(
    userEmail: string,
    input: ListContextDocumentsInput = {},
  ): Promise<ApplicationContextDocumentList> {
    const limit: number = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset: number = ApplicationContextDAO.parseCursor(input.cursor);
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
    const rows: ApplicationContextDocumentInternal[] = await this.database
      .prepare(
        `
          SELECT ${ApplicationContextDAO.documentColumns}
          FROM application_context_documents
          WHERE ${conditions.join(' AND ')}
          ORDER BY updated_at DESC, created_at DESC
          LIMIT ? OFFSET ?
        `,
      )
      .bind(...bindings, limit + 1, offset)
      .all<ApplicationContextDocumentInternal>()
      .then((result: D1Result<ApplicationContextDocumentInternal>): ApplicationContextDocumentInternal[] => result.results || []);
    const pageRows: ApplicationContextDocumentInternal[] = rows.slice(0, limit);
    return {
      documents: pageRows.map((row: ApplicationContextDocumentInternal): ApplicationContextDocument => this.toDocument(row)),
      nextCursor: rows.length > limit ? String(offset + limit) : undefined,
    };
  }

  public async listDeletionRunsForUser(
    userEmail: string,
    input: ListDeletionRunsInput = {},
  ): Promise<ApplicationContextDeletionRunList> {
    const limit: number = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset: number = ApplicationContextDAO.parseCursor(input.cursor);
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];
    if (input.applicationId) {
      conditions.push('application_id = ?');
      bindings.push(input.applicationId);
    }
    const rows: ApplicationContextDeletionRunInternal[] = await this.database
      .prepare(
        `
          SELECT deletion_run_id, application_id, user_email, vector_namespace, requested_vector_count, deleted_vector_count,
                 mutation_ids, status, error_message, created_at, updated_at
          FROM application_context_deletion_runs
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
      )
      .bind(...bindings, limit + 1, offset)
      .all<ApplicationContextDeletionRunInternal>()
      .then((result: D1Result<ApplicationContextDeletionRunInternal>): ApplicationContextDeletionRunInternal[] => result.results || []);
    const pageRows: ApplicationContextDeletionRunInternal[] = rows.slice(0, limit);
    return {
      deletionRuns: pageRows.map((row: ApplicationContextDeletionRunInternal): ApplicationContextDeletionRun => this.toDeletionRun(row)),
      nextCursor: rows.length > limit ? String(offset + limit) : undefined,
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

  public async markDocumentsDeletedByVectorIds(applicationId: string, userEmail: string, vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) return;
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    for (const chunk of ApplicationContextDAO.chunk(vectorIds, 100)) {
      const placeholders: string = chunk.map((): string => '?').join(', ');
      const result: D1Result = await this.database
        .prepare(
          `
            UPDATE application_context_documents
            SET status = ?, indexed_text = NULL, deleted_at = ?, updated_at = ?
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
      sourceDocumentId: row.source_document_id,
      sourceThreadId: row.source_thread_id,
      vectorNamespace: row.vector_namespace,
      vectorId: row.vector_id,
      title: row.title,
      sender: row.sender,
      indexedText: row.status === APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE ? row.indexed_text : null,
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

  private static parseCursor(cursor: string | undefined): number {
    if (!cursor) return 0;
    const parsed: number = Number.parseInt(cursor, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
    'title',
    'sender',
    'indexed_text',
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
  title: string;
  sender: string;
  indexedText: string;
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

export { ApplicationContextDAO };
export type { ListContextDocumentsInput, ListDeletionRunsInput, RecordDeletionRunInput, UpsertEmailDocumentInput };
