import type { ProcessedMessageStatus, ProviderId } from '../constants';

interface ProcessedMessage {
  processedMessageId: string;
  applicationId: string;
  providerId: ProviderId;
  providerMessageId: string;
  providerThreadId?: string | null | undefined;
  status: ProcessedMessageStatus;
  summarySentAt?: number | null | undefined;
  errorMessage?: string | null | undefined;
  createdAt: number;
  updatedAt: number;
}

interface ProcessedMessageInternal {
  processed_message_id: string;
  application_id: string;
  provider_id: ProviderId;
  provider_message_id: string;
  provider_thread_id: string | null;
  status: ProcessedMessageStatus;
  summary_sent_at: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export type { ProcessedMessage, ProcessedMessageInternal };
