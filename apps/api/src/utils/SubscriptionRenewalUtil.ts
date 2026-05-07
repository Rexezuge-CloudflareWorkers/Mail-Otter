import {
  DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS,
  DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS,
  DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@/dao';
import type { ConnectedApplication, OAuth2Credentials, ProviderSubscription } from '@mail-otter/shared/model';
import { ConfigurationUtil, TimestampUtil } from '@mail-otter/shared/utils';
import { GmailProviderUtil } from './GmailProviderUtil';
import { OAuth2ProviderUtil } from './OAuth2ProviderUtil';
import { OutlookProviderUtil } from './OutlookProviderUtil';
import { WebhookSecurityUtil } from './WebhookSecurityUtil';

class SubscriptionRenewalUtil {
  public static async renewDueSubscriptions(env: SubscriptionRenewalEnv): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const gmailWindowHours: number = ConfigurationUtil.getPositiveInteger(
      env.GMAIL_WATCH_RENEWAL_WINDOW_HOURS,
      DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS,
    );
    const outlookWindowHours: number = ConfigurationUtil.getPositiveInteger(
      env.OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS,
      DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS,
    );
    const maxWindowSeconds: number = Math.max(gmailWindowHours, outlookWindowHours) * 60 * 60;
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const subscriptions: ProviderSubscription[] = await subscriptionDAO.listActiveRenewalCandidates(now, now + maxWindowSeconds);
    for (const subscription of subscriptions) {
      try {
        if (subscription.providerId === PROVIDER_GOOGLE_GMAIL && (subscription.expiresAt || 0) <= now + gmailWindowHours * 60 * 60) {
          await SubscriptionRenewalUtil.renewGmail(subscription, applicationDAO, subscriptionDAO, env);
        }
        if (subscription.providerId === PROVIDER_MICROSOFT_OUTLOOK && (subscription.expiresAt || 0) <= now + outlookWindowHours * 60 * 60) {
          await SubscriptionRenewalUtil.renewOutlook(subscription, applicationDAO, subscriptionDAO, env);
        }
      } catch (error: unknown) {
        await subscriptionDAO.markError(subscription.subscriptionId, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private static async renewGmail(
    subscription: ProviderSubscription,
    applicationDAO: ConnectedApplicationDAO,
    subscriptionDAO: ProviderSubscriptionDAO,
    _env: SubscriptionRenewalEnv,
  ): Promise<void> {
    const application: ConnectedApplication | undefined = await applicationDAO.getById(subscription.applicationId);
    if (!application || !application.gmailPubsubTopicName) return;
    const accessToken: string = await SubscriptionRenewalUtil.refresh(application, applicationDAO);
    const watch = await GmailProviderUtil.watchInbox(accessToken, application.gmailPubsubTopicName);
    await subscriptionDAO.upsertActive({
      applicationId: application.applicationId,
      providerId: application.providerId,
      webhookSecretHash: subscription.webhookSecretHash,
      gmailHistoryId: watch.historyId,
      resource: application.gmailPubsubTopicName,
      expiresAt: watch.expiresAt,
    });
  }

  private static async renewOutlook(
    subscription: ProviderSubscription,
    applicationDAO: ConnectedApplicationDAO,
    subscriptionDAO: ProviderSubscriptionDAO,
    env: SubscriptionRenewalEnv,
  ): Promise<void> {
    const application: ConnectedApplication | undefined = await applicationDAO.getById(subscription.applicationId);
    if (!application || !subscription.externalSubscriptionId) return;
    const accessToken: string = await SubscriptionRenewalUtil.refresh(application, applicationDAO);
    const ttlDays: number = ConfigurationUtil.getPositiveInteger(env.OUTLOOK_SUBSCRIPTION_TTL_DAYS, DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS);
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), ttlDays);
    const renewed = await OutlookProviderUtil.renewSubscription(accessToken, subscription.externalSubscriptionId, expiresAt);
    await subscriptionDAO.upsertActive({
      applicationId: application.applicationId,
      providerId: application.providerId,
      externalSubscriptionId: renewed.id,
      clientStateHash: subscription.clientStateHash || (await WebhookSecurityUtil.hashSecret(WebhookSecurityUtil.generateSecret())),
      resource: renewed.resource,
      expiresAt: renewed.expiresAt,
    });
  }

  private static async refresh(application: ConnectedApplication, applicationDAO: ConnectedApplicationDAO): Promise<string> {
    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: application.providerId,
      credentials: application.credentials as OAuth2Credentials,
    });
    if (tokenResult.refreshToken) {
      await applicationDAO.updateOAuth2RefreshToken(application.applicationId, tokenResult.refreshToken);
    }
    return tokenResult.accessToken;
  }
}

interface SubscriptionRenewalEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  GMAIL_WATCH_RENEWAL_WINDOW_HOURS?: string | undefined;
  OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS?: string | undefined;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
}

export { SubscriptionRenewalUtil };
export type { SubscriptionRenewalEnv };
