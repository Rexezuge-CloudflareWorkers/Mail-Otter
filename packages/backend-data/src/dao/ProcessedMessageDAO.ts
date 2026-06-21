import {
  PROCESSED_MESSAGE_STATUS_ERROR,
  PROCESSED_MESSAGE_STATUS_PROCESSING,
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
} from '@mail-otter/shared/constants';
import { executeD1WithRetry } from '../utils';
import type { D1Queryable } from '../utils';
import type { ProcessedMessage, ProcessedMessageInternal } from '@mail-otter/shared/model';
import type { ProcessedMessageStatus, ProviderId } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';

class ProcessedMessageDAO {
  protected readonly database: D1Queryable;

  constructor(database: D1Queryable) {
    this.database = database;
  }

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
    const inserted: boolean = ((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
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
    await this.updateRetryMetadata(applicationId, providerMessageId, providerThreadId, options.providerStableMessageFingerprint);
    return true;
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
              WHERE updated_at < ? AND status IN (${placeholders})
              LIMIT ?
            `,
          )
          .bind(olderThan, ...statuses, limit)
          .run(),
      'delete old processed messages',
    );
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
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
          .bind(status, setSummarySentAt ? 1 : 0, now, errorMessage ? errorMessage.slice(0, 1024) : null, now, applicationId, providerMessageId)
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

  private async updateRetryMetadata(
    applicationId: string,
    providerMessageId: string,
    providerThreadId: string | null | undefined,
    providerStableMessageFingerprint: string | null | undefined,
  ): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE processed_messages
              SET provider_thread_id = COALESCE(?, provider_thread_id),
                  provider_stable_message_fingerprint = COALESCE(?, provider_stable_message_fingerprint),
                  updated_at = ?
              WHERE application_id = ? AND provider_message_id = ?
            `,
          )
          .bind(providerThreadId || null, providerStableMessageFingerprint || null, now, applicationId, providerMessageId)
          .run(),
      'update processed message retry metadata',
    );
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
  allowExistingForRetry?: boolean | undefined;
  providerStableMessageFingerprint?: string | null | undefined;
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

export { ProcessedMessageDAO };
export type { ProcessedMessageStatusCounts };
