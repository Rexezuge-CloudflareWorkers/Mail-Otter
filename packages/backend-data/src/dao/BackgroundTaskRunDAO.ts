import { UUIDUtil, TimestampUtil } from '@mail-otter/shared/utils';
import { CursorCodec } from '@rexezuge/shared';
import { userScopeSql } from './userScope';
import type { UserScope, UserScopeSql } from './userScope';
import { BaseDAO, findRowById } from './BaseDAO';
import type { D1Result } from '@rexezuge/d1';

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
  latestPerType?: boolean;
}

class BackgroundTaskRunDAO extends BaseDAO {
  public async startRun(input: StartTaskRunInput): Promise<string> {
    const runId = UUIDUtil.getRandomUUID();
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `INSERT INTO background_task_runs (run_id, task_type, application_id, status, items_processed, items_failed, started_at, created_at) VALUES (?, ?, ?, 'running', 0, 0, ?, ?)`,
      [runId, input.taskType, input.applicationId ?? null, now, now],
    );
    return runId;
  }

  public async succeedRun(runId: string, input: CompleteTaskRunInput): Promise<void> {
    const status: BackgroundTaskRunStatus = input.itemsFailed > 0 ? 'partial_success' : 'success';
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `UPDATE background_task_runs SET status = ?, items_processed = ?, items_failed = ?, summary = ?, details = ?, completed_at = ? WHERE run_id = ?`,
      [
        status,
        input.itemsProcessed,
        input.itemsFailed,
        input.summary ?? null,
        input.details === undefined ? null : JSON.stringify(input.details),
        now,
        runId,
      ],
    );
  }

  public async failRun(runId: string, errorMessage: string, partial?: Partial<CompleteTaskRunInput>): Promise<void> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `UPDATE background_task_runs SET status = 'error', error_message = ?, items_processed = ?, items_failed = ?, summary = ?, details = ?, completed_at = ? WHERE run_id = ?`,
      [
        errorMessage,
        partial?.itemsProcessed ?? 0,
        partial?.itemsFailed ?? 0,
        partial?.summary ?? null,
        partial?.details === undefined ? null : JSON.stringify(partial.details),
        now,
        runId,
      ],
    );
  }

  public async skipRun(runId: string, reason?: string): Promise<void> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(`UPDATE background_task_runs SET status = 'skipped', summary = ?, completed_at = ? WHERE run_id = ?`, [
      reason ?? null,
      now,
      runId,
    ]);
  }

  public async getById(runId: string): Promise<BackgroundTaskRun | undefined> {
    const row: BackgroundTaskRunInternal | null = await findRowById<BackgroundTaskRunInternal>(
      this.database,
      'background_task_runs',
      'run_id',
      runId,
    );
    return row ? BackgroundTaskRunDAO.toRun(row) : undefined;
  }

  public async listForUser(scope: UserScope, options: ListTaskRunsOptions = {}): Promise<BackgroundTaskRunList> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    const where: UserScopeSql = userScopeSql(scope, 'ca');
    const conditions: string[] = [where.clause];
    const bindings: Array<string | number | null> = [...where.bindings];

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

    // When latestPerType is requested and no specific task type is selected,
    // use a window function to return only the most recent run per task type.
    if (options.latestPerType && !options.taskType) {
      const whereClause = conditions.join(' AND ');
      const rows: BackgroundTaskRunInternal[] = await this.all<BackgroundTaskRunInternal>(
        `SELECT run_id, task_type, application_id, status, items_processed, items_failed, summary, details, error_message, started_at, completed_at, created_at FROM ( SELECT btr.run_id, btr.task_type, btr.application_id, btr.status, btr.items_processed, btr.items_failed, btr.summary, btr.details, btr.error_message, btr.started_at, btr.completed_at, btr.created_at, ROW_NUMBER() OVER ( PARTITION BY btr.task_type ORDER BY btr.started_at DESC, btr.run_id DESC ) AS rn FROM background_task_runs btr INNER JOIN connected_applications ca ON ca.application_id = btr.application_id WHERE ${whereClause} ) WHERE rn = 1 ORDER BY started_at DESC, run_id DESC`,
        [...bindings],
      );

      return {
        runs: rows.map((r) => BackgroundTaskRunDAO.toRun(r)),
        nextCursor: undefined,
      };
    }

    const cursor = BackgroundTaskRunDAO.parseCursor(options.cursor);
    if (cursor) {
      conditions.push('(btr.started_at < ? OR (btr.started_at = ? AND btr.run_id < ?))');
      bindings.push(cursor.startedAt, cursor.startedAt, cursor.runId);
    }

    const rows: BackgroundTaskRunInternal[] = await this.all<BackgroundTaskRunInternal>(
      `SELECT btr.run_id, btr.task_type, btr.application_id, btr.status, btr.items_processed, btr.items_failed, btr.summary, btr.details, btr.error_message, btr.started_at, btr.completed_at, btr.created_at FROM background_task_runs btr INNER JOIN connected_applications ca ON ca.application_id = btr.application_id WHERE ${conditions.join(' AND ')} ORDER BY btr.started_at DESC, btr.run_id DESC LIMIT ?`,
      [...bindings, limit + 1],
    );

    const pageRows = rows.slice(0, limit);
    return {
      runs: pageRows.map((r) => BackgroundTaskRunDAO.toRun(r)),
      nextCursor: rows.length > limit ? BackgroundTaskRunDAO.encodeCursor(pageRows.at(-1)!.started_at, pageRows.at(-1)!.run_id) : undefined,
    };
  }

  public async pruneOldRuns(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await this.run(
      `DELETE FROM background_task_runs WHERE run_id IN ( SELECT run_id FROM background_task_runs WHERE started_at < ? LIMIT ? )`,
      [olderThan, limit],
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  private static encodeCursor(startedAt: number, runId: string): string {
    return CursorCodec.encode({ startedAt, runId });
  }

  private static parseCursor(cursor: string | undefined): { startedAt: number; runId: string } | undefined {
    const parsed = CursorCodec.decode<{ startedAt?: unknown; runId?: unknown }>(cursor);
    return !parsed || typeof parsed.startedAt !== 'number' || typeof parsed.runId !== 'string'
      ? undefined
      : { startedAt: parsed.startedAt, runId: parsed.runId };
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
