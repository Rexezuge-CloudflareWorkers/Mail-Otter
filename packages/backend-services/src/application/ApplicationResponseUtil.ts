import { ApplicationContextDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type {
  ApplicationContextSummary,
  ConnectedApplicationMetadata,
  ProcessedMessage,
  ProviderSubscription,
} from '@mail-otter/shared/model';
import { BaseUrlUtil } from '@mail-otter/shared/utils';

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

    return {
      ...application,
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
}

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
  webhookUrl: string;
  watchStatus?: string | undefined;
  watchExpiresAt?: number | null | undefined;
  lastSummaryAt?: number | null | undefined;
  lastError?: string | null | undefined;
  lastErrorAt?: number | null | undefined;
  contextDocumentCount: number;
  contextLastIndexedAt?: number | null | undefined;
  contextLastDeleteAcceptedAt?: number | null | undefined;
  contextLastError?: string | null | undefined;
  contextLastErrorAt?: number | null | undefined;
}

export { ApplicationResponseUtil };
export type { ApplicationDecorationEnv, ApplicationResponse };
