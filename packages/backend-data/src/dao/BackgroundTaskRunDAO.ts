import { UUIDUtil, TimestampUtil } from '@mail-otter/shared/utils';
import { executeD1WithRetry } from '../utils';
import { CursorUtil } from '../utils';
import { BaseDAO } from './BaseDAO';

type BackgroundTaskRunStatus = 'running' | 'success' | 'partial_success' | 'error' | 'skipped';

interface BackgroundTaskRun {
  runId: string;
  taskType: string;
  applicationId: string | null;
  status: BackgroundTaskRunStatus;
  itemsProcessed: number;
  itemsFailed: number;
  summary: string | null;
  details: unknown;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
}

interface BackgroundTaskRunInternal {
  run_id: string;
  task_type: string;
  application_id: string | null;
  status: BackgroundTaskRunStatus;
  items_processed: number;
  items_failed: number;
  summary: string | null;
  details: string | null;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
  created_at: number;
}

interface BackgroundTaskRunList {
  runs: BackgroundTaskRun[];
  nextCursor?: string;
}

interface StartTaskRunInput {
  taskType: string;
  applicationId?: string;
}

interface CompleteTaskRunInput {
  itemsProcessed: number;
  itemsFailed: number;
  summary?: string;
  details?: unknown;
}

interface ListTaskRunsOptions {
  taskType?: string;
  applicationId?: string;
  status?: BackgroundTaskRunStatus;
  cursor?: string;
  limit?: number;
}

class BackgroundTaskRunDAO extends BaseDAO {
  public async startRun(input: StartTaskRunInput): Promise<string> {
    const runId = UUIDUtil.getRandomUUID();
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `INSERT INTO background_task_runs
               (run_id, task_type, application_id, status, items_processed, items_failed, started_at, created_at)
             VALUES (?, ?, ?, 'running', 0, 0, ?, ?)`,
          )
          .bind(runId, input.taskType, input.applicationId ?? null, now, now)
          .run(),
      'start background task run',
    );
    return runId;
  }

  public async succeedRun(runId: string, input: CompleteTaskRunInput): Promise<void> {
    const status: BackgroundTaskRunStatus = input.itemsFailed > 0 ? 'partial_success' : 'success';
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `UPDATE background_task_runs
             SET status = ?, items_processed = ?, items_failed = ?, summary = ?, details = ?, completed_at = ?
             WHERE run_id = ?`,
          )
          .bind(
            status,
            input.itemsProcessed,
            input.itemsFailed,
            input.summary ?? null,
            input.details === undefined ? null : JSON.stringify(input.details),
            now,
            runId,
          )
          .run(),
      'succeed background task run',
    );
  }

  public async failRun(runId: string, errorMessage: string, partial?: Partial<CompleteTaskRunInput>): Promise<void> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `UPDATE background_task_runs
             SET status = 'error', error_message = ?, items_processed = ?, items_failed = ?,
                 summary = ?, details = ?, completed_at = ?
             WHERE run_id = ?`,
          )
          .bind(
            errorMessage,
            partial?.itemsProcessed ?? 0,
            partial?.itemsFailed ?? 0,
            partial?.summary ?? null,
            partial?.details === undefined ? null : JSON.stringify(partial.details),
            now,
            runId,
          )
          .run(),
      'fail background task run',
    );
  }

  public async skipRun(runId: string, reason?: string): Promise<void> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `UPDATE background_task_runs
             SET status = 'skipped', summary = ?, completed_at = ?
             WHERE run_id = ?`,
          )
          .bind(reason ?? null, now, runId)
          .run(),
      'skip background task run',
    );
  }

  public async listForUser(userEmail: string, options: ListTaskRunsOptions = {}): Promise<BackgroundTaskRunList> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    const conditions: string[] = ['ca.user_email = ?'];
    const bindings: Array<string | number | null> = [userEmail];

    if (options.taskType) {
      conditions.push('btr.task_type = ?');
      bindings.push(options.taskType);
    }
    if (options.applicationId) {
      conditions.push('btr.application_id = ?');
      bindings.push(options.applicationId);
    }
    if (options.status) {
      conditions.push('btr.status = ?');
      bindings.push(options.status);
    }

    const cursor = BackgroundTaskRunDAO.parseCursor(options.cursor);
    if (cursor) {
      conditions.push('(btr.started_at < ? OR (btr.started_at = ? AND btr.run_id < ?))');
      bindings.push(cursor.startedAt, cursor.startedAt, cursor.runId);
    }

    const rows: BackgroundTaskRunInternal[] = await this.database
      .prepare(
        `SELECT btr.run_id, btr.task_type, btr.application_id, btr.status,
                btr.items_processed, btr.items_failed, btr.summary, btr.details,
                btr.error_message, btr.started_at, btr.completed_at, btr.created_at
         FROM background_task_runs btr
         INNER JOIN connected_applications ca ON ca.application_id = btr.application_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY btr.started_at DESC, btr.run_id DESC
         LIMIT ?`,
      )
      .bind(...bindings, limit + 1)
      .all<BackgroundTaskRunInternal>()
      .then((result: D1Result<BackgroundTaskRunInternal>): BackgroundTaskRunInternal[] => result.results || []);

    const pageRows = rows.slice(0, limit);
    return {
      runs: pageRows.map((r) => BackgroundTaskRunDAO.toRun(r)),
      nextCursor:
        rows.length > limit
          ? BackgroundTaskRunDAO.encodeCursor(pageRows.at(-1)!.started_at, pageRows.at(-1)!.run_id)
          : undefined,
    };
  }

  public async pruneOldRuns(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `DELETE FROM background_task_runs
             WHERE run_id IN (
               SELECT run_id FROM background_task_runs
               WHERE started_at < ?
               LIMIT ?
             )`,
          )
          .bind(olderThan, limit)
          .run(),
      'prune old background task runs',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  private static encodeCursor(startedAt: number, runId: string): string {
    return CursorUtil.encode({ startedAt, runId });
  }

  private static parseCursor(cursor: string | undefined): { startedAt: number; runId: string } | undefined {
    const parsed = CursorUtil.decode<{ startedAt?: unknown; runId?: unknown }>(cursor);
    if (!parsed || typeof parsed.startedAt !== 'number' || typeof parsed.runId !== 'string') return undefined;
    return { startedAt: parsed.startedAt, runId: parsed.runId };
  }

  private static toRun(row: BackgroundTaskRunInternal): BackgroundTaskRun {
    return {
      runId: row.run_id,
      taskType: row.task_type,
      applicationId: row.application_id,
      status: row.status,
      itemsProcessed: row.items_processed,
      itemsFailed: row.items_failed,
      summary: row.summary,
      details: row.details ? (JSON.parse(row.details) as unknown) : null,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    };
  }
}

export { BackgroundTaskRunDAO };
export type {
  BackgroundTaskRun,
  BackgroundTaskRunList,
  BackgroundTaskRunStatus,
  StartTaskRunInput,
  CompleteTaskRunInput,
  ListTaskRunsOptions,
};
