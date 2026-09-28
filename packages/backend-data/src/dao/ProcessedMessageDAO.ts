import {
  PROCESSED_MESSAGE_STATUS_ERROR,
  PROCESSED_MESSAGE_STATUS_PROCESSING,
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
} from '@mail-otter/shared/constants';
import { executeD1WithRetry } from '../utils';
import { CursorUtil } from '../utils';
import type { ProcessedMessage, ProcessedMessageInternal, ProcessedMessageList } from '@mail-otter/shared/model';
import type { ProcessedMessageStatus, ProviderId } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { userScopeSql } from './userScope';
import type { UserScope, UserScopeSql } from './userScope';
import { BaseDAO } from './BaseDAO';

/**
 * How long a row may sit in `processing` before a retry is allowed to reclaim
 * it. Comfortably longer than a single summarize+send cycle, so a healthy
 * in-flight attempt is never stolen, but short enough that a crashed workflow
 * does not block the message forever.
 */
const PROCESSING_STALE_AFTER_SECONDS = 15 * 60;

class ProcessedMessageDAO extends BaseDAO {
  public async tryStart(
    applicationId: string,
    providerId: ProviderId,
    providerMessageId: string,
    providerThreadId?: string | null,
    options: TryStartProcessedMessageOptions = {},
  ): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const processedMessageId: string = UUIDUtil.getRandomUUID();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT OR IGNORE INTO processed_messages
                (processed_message_id, application_id, provider_id, provider_message_id, provider_thread_id, provider_stable_message_fingerprint, status, summary_sent_at, error_message, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            `,
          )
          .bind(
            processedMessageId,
            applicationId,
            providerId,
            providerMessageId,
            providerThreadId || null,
            options.providerStableMessageFingerprint || null,
            PROCESSED_MESSAGE_STATUS_PROCESSING,
            now,
            now,
          )
          .run(),
      'create processed message row',
    );
    const inserted: boolean = ((result.meta as { changes?: number })?.changes ?? 0) > 0;
    if (inserted || !options.allowExistingForRetry) {
      return inserted;
    }
    const existing: ProcessedMessageInternal | null = await this.getInternalByMessageId(applicationId, providerMessageId);
    if (!existing || (existing.status !== PROCESSED_MESSAGE_STATUS_PROCESSING && existing.status !== PROCESSED_MESSAGE_STATUS_ERROR)) {
      return false;
    }
    if (options.providerStableMessageFingerprint) {
      const stableMatch: ProcessedMessageInternal | null = await this.getInternalByStableMessageFingerprint(
        applicationId,
        providerId,
        options.providerStableMessageFingerprint,
      );
      if (stableMatch && stableMatch.provider_message_id !== providerMessageId) {
        return false;
      }
    }
    return this.claimRetry(
      applicationId,
      providerMessageId,
      existing.status,
      existing.updated_at,
      providerThreadId,
      options.providerStableMessageFingerprint,
    );
  }

  public async markSummarized(applicationId: string, providerMessageId: string): Promise<void> {
    await this.updateStatus(applicationId, providerMessageId, PROCESSED_MESSAGE_STATUS_SUMMARIZED, null, true);
  }

  public async markSkipped(applicationId: string, providerMessageId: string, reason: string): Promise<void> {
    await this.updateStatus(applicationId, providerMessageId, PROCESSED_MESSAGE_STATUS_SKIPPED, reason, false);
  }

  public async markError(applicationId: string, providerMessageId: string, errorMessage: string): Promise<void> {
    await this.updateStatus(applicationId, providerMessageId, PROCESSED_MESSAGE_STATUS_ERROR, errorMessage, false);
  }

  public async deleteOlderThan(olderThan: number, statuses: string[], limit: number): Promise<number> {
    const placeholders: string = statuses.map((): string => '?').join(', ');
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM processed_messages
              WHERE processed_message_id IN (
                SELECT processed_message_id FROM processed_messages
                WHERE updated_at < ? AND status IN (${placeholders})
                LIMIT ?
              )
            `,
          )
          .bind(olderThan, ...statuses, limit)
          .run(),
      'delete old processed messages',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  public async getLatestForApplication(applicationId: string): Promise<ProcessedMessage | undefined> {
    const row: ProcessedMessageInternal | null = await this.database
      .prepare(
        `
          SELECT ${ProcessedMessageDAO.processedMessageColumns}
          FROM processed_messages
          WHERE application_id = ? AND status = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId, PROCESSED_MESSAGE_STATUS_SUMMARIZED)
      .first<ProcessedMessageInternal>();
    return row ? this.toProcessedMessage(row) : undefined;
  }

  public async getLatestErrorForApplication(applicationId: string): Promise<ProcessedMessage | undefined> {
    const row: ProcessedMessageInternal | null = await this.database
      .prepare(
        `
          SELECT ${ProcessedMessageDAO.processedMessageColumns}
          FROM processed_messages
          WHERE application_id = ? AND status = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId, PROCESSED_MESSAGE_STATUS_ERROR)
      .first<ProcessedMessageInternal>();
    return row ? this.toProcessedMessage(row) : undefined;
  }

  public async getStatusCountsByDateRange(
    sinceUnixSeconds: number,
    untilUnixSeconds: number,
    applicationId?: string,
  ): Promise<ProcessedMessageStatusCounts> {
    const conditions: string[] = ['created_at >= ? AND created_at <= ?'];
    const bindings: Array<string | number> = [sinceUnixSeconds, untilUnixSeconds];
    if (applicationId) {
      conditions.push('application_id = ?');
      bindings.push(applicationId);
    }
    const where: string = conditions.join(' AND ');

    const dailyRows: ProcessedMessageDailyCountInternal[] = await this.database
      .prepare(
        `
          SELECT date(created_at, 'unixepoch') AS day,
                 SUM(CASE WHEN status = 'summarized' THEN 1 ELSE 0 END) AS summarized,
                 SUM(CASE WHEN status = 'skipped'    THEN 1 ELSE 0 END) AS skipped,
                 SUM(CASE WHEN status = 'error'      THEN 1 ELSE 0 END) AS error
          FROM processed_messages
          WHERE ${where}
          GROUP BY day
          ORDER BY day ASC
        `,
      )
      .bind(...bindings)
      .all<ProcessedMessageDailyCountInternal>()
      .then((result: D1Result<ProcessedMessageDailyCountInternal>): ProcessedMessageDailyCountInternal[] => result.results || []);

    const totalRow: { summarized: number; skipped: number; error: number } | null = await this.database
      .prepare(
        `
          SELECT SUM(CASE WHEN status = 'summarized' THEN 1 ELSE 0 END) AS summarized,
                 SUM(CASE WHEN status = 'skipped'    THEN 1 ELSE 0 END) AS skipped,
                 SUM(CASE WHEN status = 'error'      THEN 1 ELSE 0 END) AS error
          FROM processed_messages
          WHERE ${where}
        `,
      )
      .bind(...bindings)
      .first<{ summarized: number; skipped: number; error: number }>();

    const summarized: number = totalRow?.summarized ?? 0;
    const skipped: number = totalRow?.skipped ?? 0;
    const error: number = totalRow?.error ?? 0;
    const totalProcessed: number = summarized + skipped + error;

    return {
      daily: dailyRows.map(
        (row: ProcessedMessageDailyCountInternal): { date: string; summarized: number; skipped: number; error: number } => ({
          date: row.day,
          summarized: row.summarized,
          skipped: row.skipped,
          error: row.error,
        }),
      ),
      total: {
        summarized,
        skipped,
        error,
        successRate: totalProcessed > 0 ? Math.round((summarized / totalProcessed) * 100) / 100 : 0,
      },
    };
  }

  public async getByMessageId(applicationId: string, providerMessageId: string): Promise<ProcessedMessage | undefined> {
    const row: ProcessedMessageInternal | null = await this.getInternalByMessageId(applicationId, providerMessageId);
    return row ? this.toProcessedMessage(row) : undefined;
  }

  private async updateStatus(
    applicationId: string,
    providerMessageId: string,
    status: ProcessedMessageStatus,
    errorMessage: string | null,
    setSummarySentAt: boolean,
  ): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE processed_messages
              SET status = ?, summary_sent_at = CASE WHEN ? THEN ? ELSE summary_sent_at END, error_message = ?, updated_at = ?
              WHERE application_id = ? AND provider_message_id = ?
            `,
          )
          .bind(
            status,
            setSummarySentAt ? 1 : 0,
            now,
            errorMessage ? errorMessage.slice(0, 1024) : null,
            now,
            applicationId,
            providerMessageId,
          )
          .run(),
      'update processed message',
    );
  }

  private async getInternalByMessageId(applicationId: string, providerMessageId: string): Promise<ProcessedMessageInternal | null> {
    return this.database
      .prepare(
        `
          SELECT ${ProcessedMessageDAO.processedMessageColumns}
          FROM processed_messages
          WHERE application_id = ? AND provider_message_id = ?
          LIMIT 1
        `,
      )
      .bind(applicationId, providerMessageId)
      .first<ProcessedMessageInternal>();
  }

  private async getInternalByStableMessageFingerprint(
    applicationId: string,
    providerId: ProviderId,
    providerStableMessageFingerprint: string,
  ): Promise<ProcessedMessageInternal | null> {
    return this.database
      .prepare(
        `
          SELECT ${ProcessedMessageDAO.processedMessageColumns}
          FROM processed_messages
          WHERE application_id = ? AND provider_id = ? AND provider_stable_message_fingerprint = ?
          LIMIT 1
        `,
      )
      .bind(applicationId, providerId, providerStableMessageFingerprint)
      .first<ProcessedMessageInternal>();
  }

  /**
   * Atomically claim an existing row for a retry attempt.
   *
   * This used to be a read-then-write with no claim at all: the caller read the
   * row, saw `status` of `processing` or `error`, wrote thread/fingerprint
   * metadata, and returned `true`. Nothing transitioned `status`, so two
   * concurrent callers both succeeded and both ran the summarize pipeline —
   * producing two AI summaries and delivering two summary emails for one
   * message. Two workflow instances for the same provider message are genuinely
   * concurrent, because a different queue message id yields a different
   * workflow instance id. `SummaryDeliveryService` re-checks `summarized`, but
   * only after generation has already been paid for.
   *
   * The claim is a single conditional UPDATE whose `WHERE` pins both the status
   * the caller observed and — for a row already `processing` — its `updated_at`.
   * The first caller to match flips the row to `processing` and bumps
   * `updated_at`, so the second caller's pinned predicates no longer match and
   * its `meta.changes` is 0. Pinning `updated_at` also stops a retry from
   * stealing a row that another worker is actively processing.
   *
   * Mirrors the conditional-UPDATE claim in `EmailActionDAO.claimForExecution`.
   */
  private async claimRetry(
    applicationId: string,
    providerMessageId: string,
    observedStatus: ProcessedMessageStatus,
    observedUpdatedAt: number,
    providerThreadId: string | null | undefined,
    providerStableMessageFingerprint: string | null | undefined,
  ): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const staleCutoff: number = now - PROCESSING_STALE_AFTER_SECONDS;
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE processed_messages
              SET status = ?,
                  provider_thread_id = COALESCE(?, provider_thread_id),
                  provider_stable_message_fingerprint = COALESCE(?, provider_stable_message_fingerprint),
                  updated_at = ?
              WHERE application_id = ?
                AND provider_message_id = ?
                AND status = ?
                AND (status <> ? OR updated_at <= ?)
            `,
          )
          .bind(
            PROCESSED_MESSAGE_STATUS_PROCESSING,
            providerThreadId || null,
            providerStableMessageFingerprint || null,
            now,
            applicationId,
            providerMessageId,
            observedStatus,
            PROCESSED_MESSAGE_STATUS_PROCESSING,
            staleCutoff,
          )
          .run(),
      'claim processed message retry',
    );
    return ((result.meta as { changes?: number })?.changes ?? 0) > 0;
  }

  private toProcessedMessage(row: ProcessedMessageInternal): ProcessedMessage {
    return {
      processedMessageId: row.processed_message_id,
      applicationId: row.application_id,
      providerId: row.provider_id,
      providerMessageId: row.provider_message_id,
      providerThreadId: row.provider_thread_id,
      providerStableMessageFingerprint: row.provider_stable_message_fingerprint,
      status: row.status,
      summarySentAt: row.summary_sent_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async listForUser(scope: UserScope, options: ListProcessedMessagesOptions = {}): Promise<ProcessedMessageList> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    const where: UserScopeSql = userScopeSql(scope, 'ca');
    const conditions: string[] = [where.clause];
    const bindings: Array<string | number> = [...where.bindings];

    if (options.applicationId) {
      conditions.push('pm.application_id = ?');
      bindings.push(options.applicationId);
    }
    if (options.status) {
      conditions.push('pm.status = ?');
      bindings.push(options.status);
    }

    const cursor = ProcessedMessageDAO.parseListCursor(options.cursor);
    if (cursor) {
      conditions.push('(pm.created_at < ? OR (pm.created_at = ? AND pm.processed_message_id < ?))');
      bindings.push(cursor.createdAt, cursor.createdAt, cursor.processedMessageId);
    }

    const rows: ProcessedMessageInternal[] = await this.database
      .prepare(
        `SELECT pm.processed_message_id, pm.application_id, pm.provider_id, pm.provider_message_id,
                pm.provider_thread_id, pm.provider_stable_message_fingerprint,
                pm.status, pm.summary_sent_at, pm.error_message, pm.created_at, pm.updated_at
         FROM processed_messages pm
         INNER JOIN connected_applications ca ON ca.application_id = pm.application_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY pm.created_at DESC, pm.processed_message_id DESC
         LIMIT ?`,
      )
      .bind(...bindings, limit + 1)
      .all<ProcessedMessageInternal>()
      .then((result: D1Result<ProcessedMessageInternal>): ProcessedMessageInternal[] => result.results || []);

    const pageRows = rows.slice(0, limit);
    return {
      messages: pageRows.map((row) => this.toProcessedMessage(row)),
      nextCursor:
        rows.length > limit
          ? ProcessedMessageDAO.encodeListCursor(pageRows.at(-1)!.created_at, pageRows.at(-1)!.processed_message_id)
          : undefined,
    };
  }

  private static encodeListCursor(createdAt: number, processedMessageId: string): string {
    return CursorUtil.encode({ createdAt, processedMessageId });
  }

  private static parseListCursor(cursor: string | undefined): { createdAt: number; processedMessageId: string } | undefined {
    const parsed = CursorUtil.decode<{ createdAt?: unknown; processedMessageId?: unknown }>(cursor);
    return !parsed || typeof parsed.createdAt !== 'number' || typeof parsed.processedMessageId !== 'string'
      ? undefined
      : { createdAt: parsed.createdAt, processedMessageId: parsed.processedMessageId };
  }

  private static readonly processedMessageColumns: string = [
    'processed_message_id',
    'application_id',
    'provider_id',
    'provider_message_id',
    'provider_thread_id',
    'provider_stable_message_fingerprint',
    'status',
    'summary_sent_at',
    'error_message',
    'created_at',
    'updated_at',
  ].join(', ');
}

interface TryStartProcessedMessageOptions {
  allowExistingForRetry?: boolean;
  providerStableMessageFingerprint?: string | null;
}

interface ProcessedMessageDailyCountInternal {
  day: string;
  summarized: number;
  skipped: number;
  error: number;
}

interface ProcessedMessageStatusCounts {
  daily: Array<{ date: string; summarized: number; skipped: number; error: number }>;
  total: { summarized: number; skipped: number; error: number; successRate: number };
}

interface ListProcessedMessagesOptions {
  applicationId?: string;
  status?: ProcessedMessageStatus;
  cursor?: string;
  limit?: number;
}

export { ProcessedMessageDAO };
export type { ProcessedMessageStatusCounts, ListProcessedMessagesOptions };
