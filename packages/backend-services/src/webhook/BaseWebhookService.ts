import { ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { UnauthorizedError } from '@mail-otter/backend-errors';
import type { EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

// Strategy base for webhook handlers: shared verify → enqueue → touch pipeline.
// Each provider keeps its own error semantics; this base supplies the mechanics.
class BaseWebhookService {
  protected static async getSubscriptionByApplication(
    db: D1Queryable,
    applicationId: string,
  ): Promise<{ dao: ProviderSubscriptionDAO; subscription: ProviderSubscription | undefined }> {
    const dao = new ProviderSubscriptionDAO(db);
    const subscription = await dao.getByApplication(applicationId);
    return { dao, subscription };
  }

  protected static async matchesSecret(
    token: string | null | undefined,
    hash: string | null | undefined,
  ): Promise<boolean> {
    return WebhookSecurityUtil.matchesSecret(token, hash);
  }

  protected static async enqueueAndTouch(
    queue: Queue<EmailQueueMessage>,
    dao: ProviderSubscriptionDAO,
    subscriptionId: string,
    message: EmailQueueMessage,
  ): Promise<void> {
    await queue.send(message);
    await dao.touchNotification(subscriptionId);
  }

  protected static async getAuthorizedSubscription(
    applicationId: string,
    externalSubscriptionId: string,
    clientState: string | undefined,
    subscriptionDAO: ProviderSubscriptionDAO,
    requireClientState: boolean,
  ): Promise<ProviderSubscription> {
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByExternalSubscriptionId(externalSubscriptionId);
    if (!subscription || subscription.applicationId !== applicationId) {
      throw new UnauthorizedError('Unknown Outlook subscription.');
    }
    if (requireClientState && !(await WebhookSecurityUtil.matchesSecret(clientState, subscription.clientStateHash))) {
      throw new UnauthorizedError('Invalid Outlook clientState.');
    }
    return subscription;
  }

  protected static async handleNotificationTemplate<TNotification>(
    notifications: readonly TNotification[],
    dao: ProviderSubscriptionDAO,
    queue: Queue<EmailQueueMessage>,
    authorize: (notification: TNotification) => Promise<ProviderSubscription>,
    toQueueMessage: (notification: TNotification) => EmailQueueMessage | undefined,
  ): Promise<void> {
    for (const notification of notifications) {
      const subscription = await authorize(notification);
      const message = toQueueMessage(notification);
      if (!message) continue;
      await this.enqueueAndTouch(queue, dao, subscription.subscriptionId, message);
    }
  }
}

export { BaseWebhookService };
