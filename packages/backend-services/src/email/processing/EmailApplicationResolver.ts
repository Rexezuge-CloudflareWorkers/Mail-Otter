import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { PROVIDER_SUBSCRIPTION_STATUS_ACTIVE } from '@mail-otter/shared/constants';
import type { ConnectedApplication, EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { isImapPasswordApplication, requiresProviderMailbox } from '@mail-otter/shared/model';
import { NonRetryableError } from '@mail-otter/backend-errors';
import { OAuth2AccessTokenService } from '../../oauth2/OAuth2AccessTokenService';
import type { EmailProcessingEnv, GmailMessageList, ResolvedApplication } from './EmailProcessingTypes';

/**
 * Single-responsibility resolver for queued email events.
 *
 * Extracted from `EmailProcessingUtil` (resolve + Gmail list/history).
 * Owns DAO access + token resolution; processors own provider SDK calls.
 */
class EmailApplicationResolver {
  constructor(
    private readonly env: EmailProcessingEnv,
    private readonly tokenService?: OAuth2AccessTokenService,
  ) {}

  public async resolveApplication(message: EmailQueueMessage): Promise<ResolvedApplication> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(message.applicationId);
    if (!application) {
      throw new NonRetryableError('Connected application was not found for queued email event.');
    }
    if (requiresProviderMailbox(application)) {
      throw new NonRetryableError('Connected application does not have a provider mailbox address.');
    }
    const accessToken: string = isImapPasswordApplication(application)
      ? ''
      : await (this.tokenService ?? new OAuth2AccessTokenService(this.env)).getAccessToken(application.applicationId);
    const enabledApplicationIds: string[] = await applicationDAO.listContextEnabledApplicationIdsByUserEmail(
      application.userEmail,
    );
    return { application, accessToken, enabledApplicationIds };
  }

  public async listGmailMessages(
    application: ConnectedApplication,
    accessToken: string,
    notificationHistoryId: string,
  ): Promise<GmailMessageList | null> {
    const { GmailProviderUtil } = await import('@mail-otter/provider-clients/gmail');
    const subscriptionDAO = new ProviderSubscriptionDAO(this.env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    if (!subscription || subscription.status !== PROVIDER_SUBSCRIPTION_STATUS_ACTIVE) return null;
    const startHistoryId: string | undefined = subscription.gmailHistoryId || notificationHistoryId;
    const history = await GmailProviderUtil.listMessageIdsSince(
      accessToken,
      startHistoryId,
      application.watchedFolders?.map((f) => f.id) ?? undefined,
    );
    return {
      messageIds: history.messageIds,
      historyId: history.historyId || notificationHistoryId,
      subscriptionId: subscription.subscriptionId,
    };
  }

  public async updateGmailHistory(subscriptionId: string, historyId: string): Promise<void> {
    const subscriptionDAO = new ProviderSubscriptionDAO(this.env.DB);
    await subscriptionDAO.updateGmailHistory(subscriptionId, historyId);
  }
}

export { EmailApplicationResolver };
