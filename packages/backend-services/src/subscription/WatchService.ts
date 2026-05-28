import { CONNECTED_APPLICATION_STATUS_CONNECTED, PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-core/utils';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

class WatchService {
  public static async startApplicationWatch(
    userEmail: string,
    applicationId: string,
    baseUrl: string,
    env: WatchServiceEnv,
  ): Promise<StartApplicationWatchResult> {
    const application: ConnectedApplication = await WatchService.getConnectedApplicationForUser(userEmail, applicationId, env);
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Complete OAuth2 authorization before starting provider notifications.');
    }
    if (!application.providerEmail) {
      throw new BadRequestError('Connected application is missing provider mailbox metadata.');
    }

    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      return WatchService.startGmailWatch(application, accessToken, baseUrl, subscriptionDAO);
    }
    if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      return WatchService.startOutlookWatch(application, accessToken, baseUrl, env, subscriptionDAO);
    }
    throw new BadRequestError('Unsupported provider.');
  }

  public static async stopApplicationWatch(userEmail: string, applicationId: string, env: WatchServiceEnv): Promise<void> {
    const application: ConnectedApplication = await WatchService.getConnectedApplicationForUser(userEmail, applicationId, env);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      await GmailProviderUtil.stopWatch(accessToken);
    } else if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK && subscription?.externalSubscriptionId) {
      await OutlookProviderUtil.deleteSubscription(accessToken, subscription.externalSubscriptionId);
    }
    await subscriptionDAO.markStopped(application.applicationId);
  }

  private static async getConnectedApplicationForUser(
    userEmail: string,
    applicationId: string,
    env: WatchServiceEnv,
  ): Promise<ConnectedApplication> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application was not found.');
    return application;
  }

  private static async startGmailWatch(
    application: ConnectedApplication,
    accessToken: string,
    baseUrl: string,
    subscriptionDAO: ProviderSubscriptionDAO,
  ): Promise<StartApplicationWatchResult> {
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
    return {
      message: 'Gmail watch started. Configure your Google Pub/Sub push subscription to use the webhook URL.',
      webhookUrl: `${baseUrl}/api/webhooks/gmail/${application.applicationId}?token=${encodeURIComponent(webhookSecret)}`,
      watchStatus: subscription.status,
      watchExpiresAt: subscription.expiresAt || undefined,
    };
  }

  private static async startOutlookWatch(
    application: ConnectedApplication,
    accessToken: string,
    baseUrl: string,
    env: WatchServiceEnv,
    subscriptionDAO: ProviderSubscriptionDAO,
  ): Promise<StartApplicationWatchResult> {
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

interface WatchServiceEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
}

interface StartApplicationWatchResult {
  message: string;
  webhookUrl: string;
  watchStatus: string;
  watchExpiresAt?: number | undefined;
}

export { WatchService };
export type { StartApplicationWatchResult, WatchServiceEnv };
