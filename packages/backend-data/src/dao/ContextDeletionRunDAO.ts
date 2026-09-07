import { DatabaseError } from '@mail-otter/backend-errors';
import { CursorUtil } from '../utils';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDeletionRunInternal,
  ApplicationContextDeletionRunList,
} from '@mail-otter/shared/model';
import type { ApplicationContextDeletionStatus } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

// Repository for application_context_deletion_runs aggregate.
// Extracted from ApplicationContextDAO (1051 LOC god DAO) — Phase 4 phased split.
class ContextDeletionRunDAO extends BaseDAO {
  public async listDeletionRunsForUser(userEmail: string, input: ListDeletionRunsInput = {}): Promise<ApplicationContextDeletionRunList> {
    const limit: number = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];
    if (input.applicationId) {
      conditions.push('application_id = ?');
      bindings.push(input.applicationId);
    }
    const cursor: { createdAt: number } | undefined = ContextDeletionRunDAO.parseCursor(input.cursor);
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
      nextCursor: rows.length > limit ? ContextDeletionRunDAO.encodeCursor(pageRows.at(-1)!.created_at) : undefined,
    };
  }

  public async recordDeletionRun(input: RecordDeletionRunInput): Promise<ApplicationContextDeletionRun> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const deletionRunId: string = UUIDUtil.getRandomUUID();
    await this.withRetry(
      (): Promise<D1Result> =>
        this.database
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
          .run(),
      'record context deletion run',
    );
    const run: ApplicationContextDeletionRun | undefined = await this.getDeletionRunById(deletionRunId);
    if (!run) throw new DatabaseError('Failed to load context deletion run after create.');
    return run;
  }

  public async deleteOldDeletionRuns(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await this.withRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM application_context_deletion_runs
              WHERE created_at < ?
              LIMIT ?
            `,
          )
          .bind(olderThan, limit)
          .run(),
      'delete old context deletion runs',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
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

  private toDeletionRun(row: ApplicationContextDeletionRunInternal): ApplicationContextDeletionRun {
    return {
      deletionRunId: row.deletion_run_id,
      applicationId: row.application_id,
      userEmail: row.user_email,
      vectorNamespace: row.vector_namespace,
      requestedVectorCount: row.requested_vector_count,
      deletedVectorCount: row.deleted_vector_count,
      mutationIds: ContextDeletionRunDAO.parseMutationIds(row.mutation_ids),
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static parseCursor(cursor: string | undefined): { createdAt: number } | undefined {
    const parsed = CursorUtil.decode<unknown[]>(cursor);
    if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'number') {
      return { createdAt: parsed[0] };
    }
    return undefined;
  }

  private static encodeCursor(createdAt: number): string {
    return CursorUtil.encode([createdAt]);
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

export { ContextDeletionRunDAO };
export type { ListDeletionRunsInput, RecordDeletionRunInput };
