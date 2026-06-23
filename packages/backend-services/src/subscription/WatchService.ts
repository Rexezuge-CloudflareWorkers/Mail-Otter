import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_IMAP_PASSWORD } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { AnyProviderCredentials } from '../provider/IEmailProvider';

class WatchService {
  public static async startApplicationWatch(
    userEmail: string,
    applicationId: string,
    baseUrl: string,
    env: WatchServiceEnv,
  ): Promise<StartApplicationWatchResult> {
    const application: ConnectedApplication = await WatchService.getConnectedApplicationForUser(userEmail, applicationId, env);
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Complete authorization before starting provider notifications.');
    }
    if (!application.providerEmail) {
      throw new BadRequestError('Connected application is missing provider mailbox metadata.');
    }

    const provider = EmailProviderRegistry.get(application.providerId, application.connectionMethod);
    const credentials = await WatchService.resolveCredentials(application, env);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);

    const clientState = application.connectionMethod !== CONNECTION_METHOD_IMAP_PASSWORD
      ? WebhookSecurityUtil.generateSecret().slice(0, 128)
      : undefined;
    const ttlDays: number = ConfigurationManager.getOutlookSubscriptionTtlDays(env);
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), ttlDays);

    const result = await provider.startWatch(credentials, {
      baseUrl,
      watchedFolderIds: application.watchedFolders?.map((f) => f.id),
      gmailPubsubTopicName: application.gmailPubsubTopicName ?? undefined,
      clientState,
      expiresAt,
    });

    if (result.type === 'webhook') {
      const webhookUrl = result.webhookUrl?.replace('__APPLICATION_ID__', applicationId) ?? '';
      const subscription: ProviderSubscription = await subscriptionDAO.upsertActive({
        applicationId: application.applicationId,
        providerId: application.providerId,
        webhookSecretHash: result.webhookSecretHash,
        gmailHistoryId: result.gmailHistoryId,
        externalSubscriptionId: result.externalSubscriptionId,
        clientStateHash: result.clientStateHash,
        resource: result.resource,
        expiresAt: result.expiresAt,
      });
      return {
        message: result.message ?? 'Watch started.',
        webhookUrl,
        watchStatus: subscription.status,
        watchExpiresAt: subscription.expiresAt || undefined,
      };
    }

    // IMAP cursor-based polling subscription
    const subscription: ProviderSubscription = await subscriptionDAO.upsertActive({
      applicationId: application.applicationId,
      providerId: application.providerId,
      imapCursor: result.imapCursor,
    });
    return {
      message: 'IMAP polling watch started. Mail-Otter will poll for new messages on a cron schedule.',
      webhookUrl: '',
      watchStatus: subscription.status,
      watchExpiresAt: undefined,
    };
  }

  public static async stopApplicationWatch(userEmail: string, applicationId: string, env: WatchServiceEnv): Promise<void> {
    const application: ConnectedApplication = await WatchService.getConnectedApplicationForUser(userEmail, applicationId, env);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    const accessToken: string = application.connectionMethod !== CONNECTION_METHOD_IMAP_PASSWORD
      ? await OAuth2AccessTokenService.getAccessToken(application.applicationId, env)
      : '';
    try {
      await EmailProviderRegistry.get(application.providerId, application.connectionMethod).stopWatch(accessToken, subscription?.externalSubscriptionId ?? undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[WatchService] Provider unsubscribe failed, proceeding with local stop: ${message}`);
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

  private static async resolveCredentials(application: ConnectedApplication, env: WatchServiceEnv): Promise<AnyProviderCredentials> {
    if (application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD) {
      if (!application.imapUsername || !application.imapPassword) {
        throw new BadRequestError('IMAP credentials are incomplete.');
      }
      return {
        type: 'imap-password',
        username: application.imapUsername,
        password: application.imapPassword,
        host: application.imapHost ?? '',
        port: application.imapPort ?? 993,
      };
    }
    const accessToken = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    return { type: 'oauth2', accessToken };
  }
}

interface WatchServiceEnv {
  DB: D1Queryable;
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
