import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { RetryableError } from '@mail-otter/backend-errors';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

class SubscriptionRenewalUtil {
  public static async renewDueSubscriptions(env: SubscriptionRenewalEnv): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const gmailWindowHours: number = ConfigurationManager.getGmailWatchRenewalWindowHours(env);
    const outlookWindowHours: number = ConfigurationManager.getOutlookSubscriptionRenewalWindowHours(env);
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
        const message = error instanceof Error ? error.message : String(error);
        const baseDelay = ConfigurationManager.getRenewalRetryBaseDelaySeconds(env);
        const maxDelay = ConfigurationManager.getRenewalRetryMaxDelaySeconds(env);
        const currentCount = subscription.renewalRetryCount;
        const delay = Math.min(baseDelay * Math.pow(2, currentCount), maxDelay);
        const nextRetryAt = now + delay;
        if (error instanceof RetryableError) {
          await subscriptionDAO.recordTransientError(subscription.subscriptionId, message, nextRetryAt);
        } else {
          await subscriptionDAO.markError(subscription.subscriptionId, message, nextRetryAt);
        }
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
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, _env);
    const watch = await GmailProviderUtil.watchInbox(accessToken, application.gmailPubsubTopicName, application.watchedFolders?.map((f) => f.id) ?? undefined);
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
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    const ttlDays: number = ConfigurationManager.getOutlookSubscriptionTtlDays(env);
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
}

interface SubscriptionRenewalEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
  GMAIL_WATCH_RENEWAL_WINDOW_HOURS?: string | undefined;
  OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS?: string | undefined;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
  RENEWAL_RETRY_BASE_DELAY_SECONDS?: string | undefined;
  RENEWAL_RETRY_MAX_DELAY_SECONDS?: string | undefined;
}

export { SubscriptionRenewalUtil };
export type { SubscriptionRenewalEnv };
