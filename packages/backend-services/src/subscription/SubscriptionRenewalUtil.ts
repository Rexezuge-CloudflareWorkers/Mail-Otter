import { CONNECTION_METHOD_IMAP_PASSWORD, IMAP_PROVIDERS, PROVIDER_GOOGLE_GMAIL } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { RetryableError } from '@mail-otter/backend-errors';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import type { AnyProviderCredentials, WebhookWatchResult } from '../provider/IEmailProvider';

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
        if (IMAP_PROVIDERS.has(subscription.providerId)) {
          // IMAP providers do not expire subscriptions; nothing to renew.
          continue;
        }
        if (subscription.providerId === PROVIDER_GOOGLE_GMAIL && (subscription.expiresAt || 0) <= now + gmailWindowHours * 60 * 60) {
          await SubscriptionRenewalUtil.renewGmail(subscription, applicationDAO, subscriptionDAO, env);
          continue;
        }
        const windowHours = outlookWindowHours;
        if ((subscription.expiresAt || 0) <= now + windowHours * 60 * 60) {
          await SubscriptionRenewalUtil.renewViaInterface(subscription, applicationDAO, subscriptionDAO, env);
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
    env: SubscriptionRenewalEnv,
  ): Promise<void> {
    const application: ConnectedApplication | undefined = await applicationDAO.getById(subscription.applicationId);
    if (!application || !application.gmailPubsubTopicName) return;
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
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

  private static async renewViaInterface(
    subscription: ProviderSubscription,
    applicationDAO: ConnectedApplicationDAO,
    subscriptionDAO: ProviderSubscriptionDAO,
    env: SubscriptionRenewalEnv,
  ): Promise<void> {
    const application: ConnectedApplication | undefined = await applicationDAO.getById(subscription.applicationId);
    if (!application || !subscription.externalSubscriptionId) return;
    const credentials = await SubscriptionRenewalUtil.resolveCredentials(application, env);
    const ttlDays: number = ConfigurationManager.getOutlookSubscriptionTtlDays(env);
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), ttlDays);
    const provider = EmailProviderRegistry.get(application.providerId);
    const result = await provider.renewWatch(credentials, subscription.externalSubscriptionId, expiresAt);
    if (result.type === 'webhook') {
      const webhookResult = result as WebhookWatchResult;
      await subscriptionDAO.upsertActive({
        applicationId: application.applicationId,
        providerId: application.providerId,
        externalSubscriptionId: webhookResult.externalSubscriptionId ?? subscription.externalSubscriptionId,
        clientStateHash: subscription.clientStateHash || (await WebhookSecurityUtil.hashSecret(WebhookSecurityUtil.generateSecret())),
        resource: webhookResult.resource ?? subscription.resource,
        expiresAt: webhookResult.expiresAt,
      });
    }
  }

  private static async resolveCredentials(application: ConnectedApplication, env: SubscriptionRenewalEnv): Promise<AnyProviderCredentials> {
    if (application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD) {
      if (!application.imapHost || !application.imapUsername || !application.imapPassword) {
        throw new Error('IMAP credentials are incomplete.');
      }
      return {
        type: 'imap-password',
        username: application.imapUsername,
        password: application.imapPassword,
        host: application.imapHost,
        port: application.imapPort ?? 993,
      };
    }
    const accessToken = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    return { type: 'oauth2', accessToken };
  }
}

interface SubscriptionRenewalEnv {
  DB: D1Queryable;
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
