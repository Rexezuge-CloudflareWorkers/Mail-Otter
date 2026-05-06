import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplication, OAuth2Credentials, ProviderSubscription } from '@mail-otter/shared/model';
import {
  BaseUrlUtil,
  ConfigurationUtil,
  GmailProviderUtil,
  OAuth2ProviderUtil,
  OutlookProviderUtil,
  TimestampUtil,
  WebhookSecurityUtil,
} from '@/utils';

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

    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: application.providerId,
      credentials: application.credentials as OAuth2Credentials,
    });
    if (tokenResult.refreshToken) {
      await applicationDAO.updateOAuth2RefreshToken(application.applicationId, tokenResult.refreshToken);
    }

    const baseUrl: string = BaseUrlUtil.getBaseUrl(request.raw);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      return this.startGmailWatch(application, tokenResult.accessToken, baseUrl, subscriptionDAO);
    }
    if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      return this.startOutlookWatch(application, tokenResult.accessToken, baseUrl, env, subscriptionDAO);
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
    const ttlDays: number = ConfigurationUtil.getPositiveInteger(env.OUTLOOK_SUBSCRIPTION_TTL_DAYS, DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS);
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
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
}

export { StartApplicationWatchRoute };
