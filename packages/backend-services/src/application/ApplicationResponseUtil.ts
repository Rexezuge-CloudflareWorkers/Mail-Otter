import { ApplicationContextDAO, ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type {
  ApplicationContextSummary,
  ConnectedApplicationMetadata,
  DigestConfig,
  ProcessedMessage,
  ProviderSubscription,
} from '@mail-otter/shared/model';
import { BaseUrlUtil } from '@mail-otter/shared/utils';
import { DigestConfigService } from '../digest/DigestConfigService';

class ApplicationResponseUtil {
  public static async decorateApplication(
    application: ConnectedApplicationMetadata,
    env: ApplicationDecorationEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const processedMessageDAO = new ProcessedMessageDAO(env.DB);
    const contextDAO = new ApplicationContextDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    const latestMessage: ProcessedMessage | undefined = await processedMessageDAO.getLatestForApplication(application.applicationId);
    const latestError: ProcessedMessage | undefined = await processedMessageDAO.getLatestErrorForApplication(application.applicationId);
    const contextSummary: ApplicationContextSummary = await contextDAO.getSummaryByApplication(application.applicationId);
    const baseUrl: string = BaseUrlUtil.getBaseUrl(raw);
    const processingErrorText: string | null | undefined = subscription?.lastError || latestError?.errorMessage;
    const processingErrorAt: number | null = subscription?.lastError ? subscription.updatedAt : (latestError?.errorMessage ? latestError.updatedAt : null);
    const processingAcknowledged: boolean =
      application.lastErrorAcknowledgedAt != null &&
      processingErrorAt != null &&
      processingErrorAt <= application.lastErrorAcknowledgedAt;

    const contextAcknowledged: boolean =
      application.contextLastErrorAcknowledgedAt != null &&
      contextSummary.lastErrorAt != null &&
      contextSummary.lastErrorAt <= application.contextLastErrorAcknowledgedAt;

    let digestConfig: DigestConfig | null = null;
    if (env.AES_ENCRYPTION_KEY_SECRET) {
      try {
        const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
        const digestService = new DigestConfigService(new ConnectedApplicationDAO(env.DB, masterKey));
        digestConfig = await digestService.getConfig(application.applicationId);
      } catch {
        console.warn(`[ApplicationResponseUtil] Failed to fetch digest config for ${application.applicationId}`);
      }
    }

    return {
      ...application,
      digestConfig,
      oauth2RedirectUri: `${baseUrl}/api/oauth2/callback/${application.applicationId}`,
      webhookUrl: `${baseUrl}/api/webhooks/${application.providerId === 'google-gmail' ? 'gmail' : 'outlook'}/${application.applicationId}${
        subscription?.webhookSecretHash ? '?token=shown-on-watch-start' : ''
      }`,
      watchStatus: subscription?.status,
      watchExpiresAt: subscription?.expiresAt,
      lastSummaryAt: latestMessage?.summarySentAt,
      lastError: processingAcknowledged ? null : processingErrorText,
      lastErrorAt: processingAcknowledged ? null : processingErrorAt,
      contextDocumentCount: contextSummary.documentCount,
      contextLastIndexedAt: contextSummary.lastIndexedAt,
      contextLastDeleteAcceptedAt: contextSummary.lastDeleteAcceptedAt,
      contextLastError: contextAcknowledged ? null : contextSummary.lastError,
      contextLastErrorAt: contextAcknowledged ? null : contextSummary.lastErrorAt,
    };
  }
}

interface ApplicationDecorationEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret;
}

interface ApplicationResponse extends ConnectedApplicationMetadata {
  digestConfig?: DigestConfig | null;
  oauth2RedirectUri: string;
  webhookUrl: string;
  watchStatus?: string;
  watchExpiresAt?: number | null;
  lastSummaryAt?: number | null;
  lastError?: string | null;
  lastErrorAt?: number | null;
  contextDocumentCount: number;
  contextLastIndexedAt?: number | null;
  contextLastDeleteAcceptedAt?: number | null;
  contextLastError?: string | null;
  contextLastErrorAt?: number | null;
}

export { ApplicationResponseUtil };
export type { ApplicationDecorationEnv, ApplicationResponse };
