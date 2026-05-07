export type ProviderId = 'google-gmail' | 'microsoft-outlook';

export interface CurrentUser {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
  };
}

export interface ConnectedApplication {
  applicationId: string;
  userEmail: string;
  providerEmail?: string | null;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: 'oauth2';
  status: 'draft' | 'connected' | 'error';
  gmailPubsubTopicName?: string | null;
  oauth2RedirectUri?: string;
  webhookUrl?: string;
  watchStatus?: 'active' | 'stopped' | 'error';
  watchExpiresAt?: number | null;
  lastSummaryAt?: number | null;
  lastError?: string | null;
  contextIndexingEnabled: boolean;
  contextDocumentCount?: number;
  contextLastIndexedAt?: number | null;
  contextLastDeleteAcceptedAt?: number | null;
  contextLastError?: string | null;
  updatedAt: number;
}

export type ApplicationContextDocumentStatus = 'active' | 'deleted' | 'error';
export type ApplicationContextDeletionStatus = 'accepted' | 'error';

export interface ApplicationContextDocument {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceType: string;
  sourceProviderId: ProviderId;
  vectorNamespace: string;
  vectorId: string;
  sourceDocumentFingerprint?: string | null;
  sourceThreadFingerprint?: string | null;
  titleFingerprint?: string | null;
  senderFingerprint?: string | null;
  contentFingerprint?: string | null;
  indexedTextChars: number;
  status: ApplicationContextDocumentStatus;
  indexedAt?: number | null;
  deletedAt?: number | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ApplicationContextDeletionRun {
  deletionRunId: string;
  applicationId: string;
  userEmail: string;
  vectorNamespace: string;
  requestedVectorCount: number;
  deletedVectorCount: number;
  mutationIds: string[];
  status: ApplicationContextDeletionStatus;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}
