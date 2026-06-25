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
  constructor(private readonly env: WatchServiceEnv) {}

  async startApplicationWatch(userEmail: string, applicationId: string, baseUrl: string): Promise<StartApplicationWatchResult> {
    const application: ConnectedApplication = await this.getConnectedApplicationForUser(userEmail, applicationId);
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Complete authorization before starting provider notifications.');
    }
    if (!application.providerEmail) {
      throw new BadRequestError('Connected application is missing provider mailbox metadata.');
    }

    const provider = EmailProviderRegistry.get(application.providerId, application.connectionMethod);
    const credentials = await this.resolveCredentials(application);
    const subscriptionDAO = new ProviderSubscriptionDAO(this.env.DB);

    const clientState = application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD
      ? undefined
      : WebhookSecurityUtil.generateSecret().slice(0, 128);
    const ttlDays: number = ConfigurationManager.getOutlookSubscriptionTtlDays(this.env);
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), ttlDays);

    const result = await provider.startWatch(credentials, {
      baseUrl,
      applicationId,
      watchedFolderIds: application.watchedFolders?.map((f) => f.id),
      gmailPubsubTopicName: application.gmailPubsubTopicName ?? undefined,
      clientState,
      expiresAt,
    });

    if (result.type === 'webhook') {
      const webhookUrl = result.webhookUrl?.replace('__APPLICATION_ID__', () => applicationId) ?? '';
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

  async stopApplicationWatch(userEmail: string, applicationId: string): Promise<void> {
    const application: ConnectedApplication = await this.getConnectedApplicationForUser(userEmail, applicationId);
    const subscriptionDAO = new ProviderSubscriptionDAO(this.env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    const accessToken: string = application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD
      ? ''
      : await new OAuth2AccessTokenService(this.env).getAccessToken(application.applicationId);
    try {
      await EmailProviderRegistry.get(application.providerId, application.connectionMethod).stopWatch(accessToken, subscription?.externalSubscriptionId ?? undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[WatchService] Provider unsubscribe failed, proceeding with local stop: ${message}`);
    }
    await subscriptionDAO.markStopped(application.applicationId);
  }

  private async getConnectedApplicationForUser(userEmail: string, applicationId: string): Promise<ConnectedApplication> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application was not found.');
    return application;
  }

  private async resolveCredentials(application: ConnectedApplication): Promise<AnyProviderCredentials> {
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
    const accessToken = await new OAuth2AccessTokenService(this.env).getAccessToken(application.applicationId);
    return { type: 'oauth2', accessToken };
  }
}

const WatchServiceFactory = {
  create(env: WatchServiceEnv): WatchService {
    return new WatchService(env);
  },
};

interface WatchServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
}

interface StartApplicationWatchResult {
  message: string;
  webhookUrl: string;
  watchStatus: string;
  watchExpiresAt?: number;
}

export { WatchService, WatchServiceFactory };
export type { StartApplicationWatchResult, WatchServiceEnv };
