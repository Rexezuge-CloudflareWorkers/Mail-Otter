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
  updatedAt: number;
}
