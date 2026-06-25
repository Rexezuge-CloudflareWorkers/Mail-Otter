import type { ProcessedMessageStatus, ProviderId } from '../constants';

interface ProcessedMessage {
  processedMessageId: string;
  applicationId: string;
  providerId: ProviderId;
  providerMessageId: string;
  providerThreadId?: string | null;
  providerStableMessageFingerprint?: string | null;
  status: ProcessedMessageStatus;
  summarySentAt?: number | null;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ProcessedMessageInternal {
  processed_message_id: string;
  application_id: string;
  provider_id: ProviderId;
  provider_message_id: string;
  provider_thread_id: string | null;
  provider_stable_message_fingerprint: string | null;
  status: ProcessedMessageStatus;
  summary_sent_at: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

interface ProcessedMessageList {
  messages: ProcessedMessage[];
  nextCursor?: string;
}

export type { ProcessedMessage, ProcessedMessageInternal, ProcessedMessageList };
