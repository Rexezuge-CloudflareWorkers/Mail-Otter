import {
  PROCESSED_MESSAGE_STATUS_ERROR,
  PROCESSED_MESSAGE_STATUS_PROCESSING,
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
} from '@mail-otter/shared/constants';
import { DatabaseError } from '@/error';
import type { ProcessedMessage, ProcessedMessageInternal } from '@mail-otter/shared/model';
import type { ProcessedMessageStatus, ProviderId } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';

class ProcessedMessageDAO {
  protected readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  public async tryStart(
    applicationId: string,
    providerId: ProviderId,
    providerMessageId: string,
    providerThreadId?: string | null,
  ): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const processedMessageId: string = UUIDUtil.getRandomUUID();
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT OR IGNORE INTO processed_messages
            (processed_message_id, application_id, provider_id, provider_message_id, provider_thread_id, subject, status, summary_sent_at, error_message, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
        `,
      )
      .bind(
        processedMessageId,
        applicationId,
        providerId,
        providerMessageId,
        providerThreadId || null,
        PROCESSED_MESSAGE_STATUS_PROCESSING,
        now,
        now,
      )
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to create processed message row: ${result.error}`);
    }
    return ((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
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

  public async getLatestForApplication(applicationId: string): Promise<ProcessedMessage | undefined> {
    const row: ProcessedMessageInternal | null = await this.database
      .prepare(
        `
          SELECT processed_message_id, application_id, provider_id, provider_message_id, provider_thread_id, status, summary_sent_at, error_message, created_at, updated_at
          FROM processed_messages
          WHERE application_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .bind(applicationId)
      .first<ProcessedMessageInternal>();
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
    const result: D1Result = await this.database
      .prepare(
        `
          UPDATE processed_messages
          SET status = ?, summary_sent_at = CASE WHEN ? THEN ? ELSE summary_sent_at END, error_message = ?, updated_at = ?
          WHERE application_id = ? AND provider_message_id = ?
        `,
      )
      .bind(status, setSummarySentAt ? 1 : 0, now, errorMessage ? errorMessage.slice(0, 1024) : null, now, applicationId, providerMessageId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to update processed message: ${result.error}`);
    }
  }

  private toProcessedMessage(row: ProcessedMessageInternal): ProcessedMessage {
    return {
      processedMessageId: row.processed_message_id,
      applicationId: row.application_id,
      providerId: row.provider_id,
      providerMessageId: row.provider_message_id,
      providerThreadId: row.provider_thread_id,
      status: row.status,
      summarySentAt: row.summary_sent_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { ProcessedMessageDAO };
