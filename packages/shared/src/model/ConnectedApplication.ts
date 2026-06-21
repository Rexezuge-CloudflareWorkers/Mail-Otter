import type { ConnectedApplicationStatus, ConnectionMethod, ProviderId } from '../constants';

interface SenderDomainFilters {
  includeRules: string[];
  excludeRules: string[];
}

interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string | undefined;
}

type ConnectedApplicationCredentials = OAuth2Credentials;

interface ConnectedApplicationMetadata {
  applicationId: string;
  userEmail: string;
  providerEmail?: string | null | undefined;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: ConnectionMethod;
  status: ConnectedApplicationStatus;
  contextIndexingEnabled: boolean;
  maxContextDocuments?: number | null | undefined;
  enabledFeatures?: string[] | null | undefined;
  senderDomainFilters?: SenderDomainFilters | null | undefined;
  gmailPubsubTopicName?: string | null | undefined;
  watchedFolders?: Array<{ id: string; name: string }> | null | undefined;
  oauth2RedirectUri?: string | undefined;
  webhookUrl?: string | undefined;
  watchStatus?: string | undefined;
  watchExpiresAt?: number | null | undefined;
  lastSummaryAt?: number | null | undefined;
  lastError?: string | null | undefined;
  lastErrorAt?: number | null | undefined;
  contextDocumentCount?: number | undefined;
  contextLastIndexedAt?: number | null | undefined;
  contextLastDeleteAcceptedAt?: number | null | undefined;
  contextLastError?: string | null | undefined;
  contextLastErrorAt?: number | null | undefined;
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
  max_context_documents: number | null;
  created_at: number;
  updated_at: number;
}

export type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
  SenderDomainFilters,
};
