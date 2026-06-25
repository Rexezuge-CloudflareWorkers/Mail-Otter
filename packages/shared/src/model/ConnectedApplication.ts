import type { ConnectedApplicationStatus as ConnectedAppStatus, ConnectionMethod, ProviderId } from '../constants';
import type { DigestConfig } from './DigestConfig';
import type { EmailProcessingRule } from './EmailRule';

interface SenderDomainFilters {
  includeRules: string[];
}

interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

interface ImapPasswordCredentials {
  imapPassword: string;
}

type ConnectedAppCredentials = OAuth2Credentials | ImapPasswordCredentials;

interface ConnectedAppMetadata {
  applicationId: string;
  userEmail: string;
  providerEmail?: string | null;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: ConnectionMethod;
  status: ConnectedAppStatus;
  contextIndexingEnabled: boolean;
  ragRetrievalEnabled: boolean;
  attachmentVisionEnabled: boolean;
  maxContextDocuments?: number | null;
  enabledFeatures?: string[] | null;
  timeZone?: string | null;
  senderDomainFilters?: SenderDomainFilters | null;
  emailProcessingRules?: EmailProcessingRule[] | null;
  autoExecuteActionTypes?: string[] | null;
  digestConfig?: DigestConfig | null;
  gmailPubsubTopicName?: string | null;
  imapHost?: string | null;
  imapPort?: number | null;
  imapUsername?: string | null;
  imapPassword?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  watchedFolders?: Array<{ id: string; name: string }> | null;
  oauth2RedirectUri?: string;
  webhookUrl?: string;
  watchStatus?: string;
  watchExpiresAt?: number | null;
  lastSummaryAt?: number | null;
  lastError?: string | null;
  lastErrorAt?: number | null;
  lastErrorAcknowledgedAt?: number | null;
  contextDocumentCount?: number;
  contextLastIndexedAt?: number | null;
  contextLastDeleteAcceptedAt?: number | null;
  contextLastError?: string | null;
  contextLastErrorAt?: number | null;
  contextLastErrorAcknowledgedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ConnectedApp extends ConnectedAppMetadata {
  credentials: ConnectedAppCredentials;
}

interface ConnectedAppInternal {
  application_id: string;
  user_email: string;
  provider_email: string | null;
  display_name: string;
  provider_id: ProviderId;
  connection_method: ConnectionMethod;
  encrypted_credentials: string;
  credentials_iv: string;
  status: ConnectedAppStatus;
  context_indexing_enabled: number;
  rag_retrieval_enabled: number;
  max_context_documents: number | null;
  last_error_acknowledged_at: number | null;
  context_last_error_acknowledged_at: number | null;
  created_at: number;
  updated_at: number;
}

export type {
  ConnectedApp as ConnectedApplication,
  ConnectedAppCredentials as ConnectedApplicationCredentials,
  ConnectedAppInternal as ConnectedApplicationInternal,
  ConnectedAppMetadata as ConnectedApplicationMetadata,
  ImapPasswordCredentials,
  OAuth2Credentials,
  SenderDomainFilters,
};
