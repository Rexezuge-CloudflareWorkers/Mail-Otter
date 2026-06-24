import type { ConnectedApplicationStatus, ConnectionMethod, ProviderId } from '../constants';
import type { DigestConfig } from './DigestConfig';
import type { EmailProcessingRule } from './EmailRule';

interface SenderDomainFilters {
  includeRules: string[];
}

interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string | undefined;
}

interface ImapPasswordCredentials {
  imapPassword: string;
}

type ConnectedApplicationCredentials = OAuth2Credentials | ImapPasswordCredentials;

interface ConnectedApplicationMetadata {
  applicationId: string;
  userEmail: string;
  providerEmail?: string | null | undefined;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: ConnectionMethod;
  status: ConnectedApplicationStatus;
  contextIndexingEnabled: boolean;
  ragRetrievalEnabled: boolean;
  maxContextDocuments?: number | null | undefined;
  enabledFeatures?: string[] | null | undefined;
  timeZone?: string | null | undefined;
  senderDomainFilters?: SenderDomainFilters | null | undefined;
  emailProcessingRules?: EmailProcessingRule[] | null | undefined;
  autoExecuteActionTypes?: string[] | null | undefined;
  digestConfig?: DigestConfig | null | undefined;
  gmailPubsubTopicName?: string | null | undefined;
  imapHost?: string | null | undefined;
  imapPort?: number | null | undefined;
  imapUsername?: string | null | undefined;
  imapPassword?: string | null | undefined;
  smtpHost?: string | null | undefined;
  smtpPort?: number | null | undefined;
  watchedFolders?: Array<{ id: string; name: string }> | null | undefined;
  oauth2RedirectUri?: string | undefined;
  webhookUrl?: string | undefined;
  watchStatus?: string | undefined;
  watchExpiresAt?: number | null | undefined;
  lastSummaryAt?: number | null | undefined;
  lastError?: string | null | undefined;
  lastErrorAt?: number | null | undefined;
  lastErrorAcknowledgedAt?: number | null | undefined;
  contextDocumentCount?: number | undefined;
  contextLastIndexedAt?: number | null | undefined;
  contextLastDeleteAcceptedAt?: number | null | undefined;
  contextLastError?: string | null | undefined;
  contextLastErrorAt?: number | null | undefined;
  contextLastErrorAcknowledgedAt?: number | null | undefined;
  createdAt: number;
  updatedAt: number;
}

interface ConnectedApplication extends ConnectedApplicationMetadata {
  credentials: ConnectedApplicationCredentials;
}

interface ConnectedApplicationInternal {
  application_id: string;
  user_email: string;
  provider_email: string | null;
  display_name: string;
  provider_id: ProviderId;
  connection_method: ConnectionMethod;
  encrypted_credentials: string;
  credentials_iv: string;
  status: ConnectedApplicationStatus;
  context_indexing_enabled: number;
  rag_retrieval_enabled: number;
  max_context_documents: number | null;
  last_error_acknowledged_at: number | null;
  context_last_error_acknowledged_at: number | null;
  created_at: number;
  updated_at: number;
}

export type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  ImapPasswordCredentials,
  OAuth2Credentials,
  SenderDomainFilters,
};
