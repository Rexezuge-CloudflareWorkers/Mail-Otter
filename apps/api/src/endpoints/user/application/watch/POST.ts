import { CONNECTED_APPLICATION_STATUS_CONNECTED, PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { BaseUrlUtil, ConfigurationManager, TimestampUtil } from '@mail-otter/backend-core/utils';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

class StartApplicationWatchRoute extends IUserRoute<StartApplicationWatchRequest, StartApplicationWatchResponse, StartApplicationWatchEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Start provider push notifications',
    responses: {
      '200': {
        description: 'Watch started',
      },
    },
  };

  protected async handleRequest(
    request: StartApplicationWatchRequest,
    env: StartApplicationWatchEnv,
    cxt: RouteContext<StartApplicationWatchEnv>,
  ): Promise<StartApplicationWatchResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) throw new BadRequestError('Connected application was not found.');
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Complete OAuth2 authorization before starting provider notifications.');
    }
    if (!application.providerEmail) {
      throw new BadRequestError('Connected application is missing provider mailbox metadata.');
    }

    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);

    const baseUrl: string = BaseUrlUtil.getBaseUrl(request.raw);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      return this.startGmailWatch(application, accessToken, baseUrl, subscriptionDAO);
    }
    if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      return this.startOutlookWatch(application, accessToken, baseUrl, env, subscriptionDAO);
    }
    throw new BadRequestError('Unsupported provider.');
  }

  private async startGmailWatch(
    application: ConnectedApplication,
    accessToken: string,
    baseUrl: string,
    subscriptionDAO: ProviderSubscriptionDAO,
  ): Promise<StartApplicationWatchResponse> {
    if (!application.gmailPubsubTopicName) {
      throw new BadRequestError('Gmail Pub/Sub topic name is required before starting Gmail watch.');
    }
    const webhookSecret: string = WebhookSecurityUtil.generateSecret();
    const watch = await GmailProviderUtil.watchInbox(accessToken, application.gmailPubsubTopicName);
    const subscription: ProviderSubscription = await subscriptionDAO.upsertActive({
      applicationId: application.applicationId,
      providerId: application.providerId,
      webhookSecretHash: await WebhookSecurityUtil.hashSecret(webhookSecret),
      gmailHistoryId: watch.historyId,
      resource: application.gmailPubsubTopicName,
      expiresAt: watch.expiresAt,
    });
    const webhookUrl: string = `${baseUrl}/api/webhooks/gmail/${application.applicationId}?token=${encodeURIComponent(webhookSecret)}`;
    return {
      message: 'Gmail watch started. Configure your Google Pub/Sub push subscription to use the webhook URL.',
      webhookUrl,
      watchStatus: subscription.status,
      watchExpiresAt: subscription.expiresAt || undefined,
    };
  }

  private async startOutlookWatch(
    application: ConnectedApplication,
    accessToken: string,
    baseUrl: string,
    env: StartApplicationWatchEnv,
    subscriptionDAO: ProviderSubscriptionDAO,
  ): Promise<StartApplicationWatchResponse> {
    const clientState: string = WebhookSecurityUtil.generateSecret().slice(0, 128);
    const ttlDays: number = ConfigurationManager.getOutlookSubscriptionTtlDays(env);
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), ttlDays);
    const notificationUrl: string = `${baseUrl}/api/webhooks/outlook/${application.applicationId}`;
    const lifecycleNotificationUrl: string = `${baseUrl}/api/webhooks/outlook/lifecycle/${application.applicationId}`;
    const graphSubscription = await OutlookProviderUtil.createInboxSubscription(
      accessToken,
      notificationUrl,
      lifecycleNotificationUrl,
      clientState,
      expiresAt,
    );
    const subscription: ProviderSubscription = await subscriptionDAO.upsertActive({
      applicationId: application.applicationId,
      providerId: application.providerId,
      externalSubscriptionId: graphSubscription.id,
      clientStateHash: await WebhookSecurityUtil.hashSecret(clientState),
      resource: graphSubscription.resource,
      expiresAt: graphSubscription.expiresAt,
    });
    return {
      message: 'Outlook subscription started.',
      webhookUrl: notificationUrl,
      watchStatus: subscription.status,
      watchExpiresAt: subscription.expiresAt || undefined,
    };
  }
}

interface StartApplicationWatchRequest extends IRequest {
  applicationId: string;
}

interface StartApplicationWatchResponse extends IResponse {
  message: string;
  webhookUrl: string;
  watchStatus: string;
  watchExpiresAt?: number | undefined;
}

interface StartApplicationWatchEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
}

export { StartApplicationWatchRoute };
